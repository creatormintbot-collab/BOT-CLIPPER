import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runCommand } from '../youtube/download.mjs';

function normalizeTime(value) {
  const safe = Number(value);
  if (!Number.isFinite(safe) || safe < 0) {
    return '0.000';
  }
  return safe.toFixed(3);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round3(value) {
  return Number(value.toFixed(3));
}

function spawnBuffer(command, args, { logger } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const stdoutChunks = [];
    let stderrText = '';

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(Buffer.from(chunk));
    });

    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      stderrText += text;
      if (logger) {
        logger.debug(text.trim(), { command });
      }
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({
          stdout: Buffer.concat(stdoutChunks),
          stderr: stderrText
        });
        return;
      }
      reject(new Error(`Command failed (${code}): ${command} ${args.join(' ')}\n${stderrText.trim()}`));
    });
  });
}

async function collectGrayFrames({
  sourcePath,
  startSec,
  endSec,
  ffmpegBin,
  analysisFps,
  analysisWidth,
  analysisHeight,
  logger
}) {
  const args = [
    '-v',
    'error',
    '-ss',
    normalizeTime(startSec),
    '-to',
    normalizeTime(endSec),
    '-i',
    sourcePath,
    '-an',
    '-vf',
    `fps=${analysisFps},scale=${analysisWidth}:${analysisHeight},format=gray`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'gray',
    '-'
  ];

  const result = await spawnBuffer(ffmpegBin, args, { logger });
  return result.stdout;
}

function frameScore(buffer, width, height) {
  const half = Math.floor(width / 2);
  const center = Math.floor(width / 2);

  let leftRight = 0;
  let centerEdge = 0;
  let edgeStrength = 0;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < half; x += 1) {
      const left = buffer[rowOffset + x];
      const right = buffer[rowOffset + (x + half)];
      leftRight += Math.abs(left - right);
    }

    const leftCenter = buffer[rowOffset + Math.max(0, center - 1)];
    const centerValue = buffer[rowOffset + center];
    const rightCenter = buffer[rowOffset + Math.min(width - 1, center + 1)];
    centerEdge += Math.abs(centerValue - leftCenter);
    centerEdge += Math.abs(rightCenter - centerValue);

    for (let x = 0; x < width - 1; x += 1) {
      const current = buffer[rowOffset + x];
      const next = buffer[rowOffset + x + 1];
      edgeStrength += Math.abs(next - current);
    }
  }

  const leftRightNorm = leftRight / Math.max(1, half * height * 255);
  const centerNorm = centerEdge / Math.max(1, 2 * height * 255);
  const edgeNorm = edgeStrength / Math.max(1, (width - 1) * height * 255);

  return clamp(leftRightNorm * 0.58 + centerNorm * 0.3 + edgeNorm * 0.12, 0, 1);
}

function classifyFrames(rawFrames, width, height) {
  const frameSize = width * height;
  if (frameSize <= 0 || rawFrames.length < frameSize) {
    return [];
  }

  const count = Math.floor(rawFrames.length / frameSize);
  const scores = [];
  for (let i = 0; i < count; i += 1) {
    const from = i * frameSize;
    const to = from + frameSize;
    const view = rawFrames.subarray(from, to);
    scores.push(frameScore(view, width, height));
  }
  return scores;
}

function mergeIntervals(intervals, durationSec) {
  const merged = [];
  for (const interval of intervals) {
    const start = clamp(interval.start, 0, durationSec);
    const end = clamp(interval.end, 0, durationSec);
    if (end - start < 0.08) {
      continue;
    }
    const prev = merged[merged.length - 1];
    if (prev && prev.mode === interval.mode && Math.abs(prev.end - start) < 0.04) {
      prev.end = end;
    } else {
      merged.push({ mode: interval.mode, start, end });
    }
  }

  if (merged.length === 0) {
    return [{ mode: 'B', start: 0, end: durationSec }];
  }

  if (merged[0].start > 0.02) {
    merged.unshift({ mode: merged[0].mode, start: 0, end: merged[0].start });
  }

  const last = merged[merged.length - 1];
  if (last.end < durationSec) {
    last.end = durationSec;
  }

  return merged;
}

function buildIntervalsFromScores(scores, durationSec, config) {
  if (!Array.isArray(scores) || scores.length === 0 || durationSec <= 0.4) {
    return [{ mode: 'B', start: 0, end: durationSec }];
  }

  const dt = 1 / config.analysisFps;
  const enterFrames = Math.max(1, Math.ceil(config.enterStableSec * config.analysisFps));
  const exitFrames = Math.max(1, Math.ceil(config.exitStableSec * config.analysisFps));
  const holdFrames = Math.max(1, Math.ceil(config.minHoldCSec * config.analysisFps));

  const intervals = [];
  let mode = 'B';
  let currentStart = 0;
  let multiCount = 0;
  let singleCount = 0;
  let holdUntilFrame = -1;

  for (let i = 0; i < scores.length; i += 1) {
    const score = scores[i];

    if (mode === 'B') {
      if (score >= config.splitEnterScore) {
        multiCount += 1;
      } else {
        multiCount = 0;
      }

      if (multiCount >= enterFrames) {
        const firstFrame = i - multiCount + 1;
        const switchTime = clamp(firstFrame * dt, currentStart, durationSec);
        if (switchTime > currentStart + 0.01) {
          intervals.push({
            mode: 'B',
            start: currentStart,
            end: switchTime
          });
        }

        mode = 'C';
        currentStart = switchTime;
        holdUntilFrame = firstFrame + holdFrames;
        multiCount = 0;
        singleCount = 0;
      }
      continue;
    }

    if (i < holdUntilFrame) {
      singleCount = 0;
      continue;
    }

    if (score <= config.splitExitScore) {
      singleCount += 1;
    } else {
      singleCount = 0;
    }

    if (singleCount >= exitFrames) {
      const firstFrame = i - singleCount + 1;
      const switchTime = clamp(firstFrame * dt, currentStart, durationSec);
      if (switchTime > currentStart + 0.01) {
        intervals.push({
          mode: 'C',
          start: currentStart,
          end: switchTime
        });
      }
      mode = 'B';
      currentStart = switchTime;
      multiCount = 0;
      singleCount = 0;
    }
  }

  intervals.push({
    mode,
    start: currentStart,
    end: durationSec
  });

  return mergeIntervals(intervals, durationSec);
}

function modeBChain({ width, height }) {
  return `scale='if(gte(iw/ih,9/16),-2,${width})':'if(gte(iw/ih,9/16),${height},-2)',crop=${width}:${height}:'if(gte(iw/ih,9/16),(iw-${width})/2,0)':'if(gte(iw/ih,9/16),0,max(0,min((ih-${height})*0.12,ih-${height})))'`;
}

function buildFilterComplex(intervals, width, height) {
  const halfHeight = Math.floor(height / 2);
  const chains = [];
  const videoOutputs = [];
  const audioOutputs = [];
  let segmentIndex = 0;

  for (const interval of intervals) {
    const start = round3(interval.start);
    const end = round3(interval.end);
    if (end - start < 0.08) {
      continue;
    }

    const vOut = `v${segmentIndex}`;
    const aOut = `a${segmentIndex}`;

    if (interval.mode === 'C') {
      const splitLeft = `v${segmentIndex}l`;
      const splitRight = `v${segmentIndex}r`;
      const top = `v${segmentIndex}t`;
      const bottom = `v${segmentIndex}b`;
      chains.push(
        `[0:v]trim=start=${normalizeTime(start)}:end=${normalizeTime(end)},setpts=PTS-STARTPTS,split=2[${splitLeft}][${splitRight}]`
      );
      chains.push(
        `[${splitLeft}]crop=iw/2:ih:0:0,scale=${width}:${halfHeight}:force_original_aspect_ratio=increase,crop=${width}:${halfHeight}[${top}]`
      );
      chains.push(
        `[${splitRight}]crop=iw/2:ih:iw/2:0,scale=${width}:${halfHeight}:force_original_aspect_ratio=increase,crop=${width}:${halfHeight}[${bottom}]`
      );
      chains.push(`[${top}][${bottom}]vstack=inputs=2[${vOut}]`);
    } else {
      chains.push(
        `[0:v]trim=start=${normalizeTime(start)}:end=${normalizeTime(end)},setpts=PTS-STARTPTS,${modeBChain({
          width,
          height
        })}[${vOut}]`
      );
    }

    chains.push(`[0:a]atrim=start=${normalizeTime(start)}:end=${normalizeTime(end)},asetpts=PTS-STARTPTS[${aOut}]`);
    videoOutputs.push(`[${vOut}]`);
    audioOutputs.push(`[${aOut}]`);
    segmentIndex += 1;
  }

  if (segmentIndex === 0) {
    return {
      filterComplex: `[0:v]${modeBChain({ width, height })}[vout];[0:a]anull[aout]`,
      videoLabel: '[vout]',
      audioLabel: '[aout]'
    };
  }

  chains.push(`${videoOutputs.join('')}concat=n=${segmentIndex}:v=1:a=0[vout]`);
  chains.push(`${audioOutputs.join('')}concat=n=${segmentIndex}:v=0:a=1[aout]`);
  return {
    filterComplex: chains.join(';'),
    videoLabel: '[vout]',
    audioLabel: '[aout]'
  };
}

async function detectAutoVerticalIntervals({
  sourcePath,
  startSec,
  endSec,
  ffmpegBin,
  verticalAutoConfig,
  logger
}) {
  const durationSec = Math.max(0.4, endSec - startSec);
  const config = {
    analysisFps: clamp(Number(verticalAutoConfig?.analysisFps) || 2, 1, 6),
    splitEnterScore: clamp(Number(verticalAutoConfig?.splitEnterScore) || 0.58, 0.1, 0.95),
    splitExitScore: clamp(Number(verticalAutoConfig?.splitExitScore) || 0.48, 0.05, 0.9),
    enterStableSec: clamp(Number(verticalAutoConfig?.enterStableSec) || 1, 0.5, 3),
    exitStableSec: clamp(Number(verticalAutoConfig?.exitStableSec) || 1, 0.5, 3),
    minHoldCSec: clamp(Number(verticalAutoConfig?.minHoldCSec) || 3, 1, 8),
    analysisWidth: clamp(Number(verticalAutoConfig?.analysisWidth) || 96, 48, 320),
    analysisHeight: clamp(Number(verticalAutoConfig?.analysisHeight) || 54, 32, 240)
  };

  try {
    const grayFrames = await collectGrayFrames({
      sourcePath,
      startSec,
      endSec,
      ffmpegBin,
      analysisFps: config.analysisFps,
      analysisWidth: config.analysisWidth,
      analysisHeight: config.analysisHeight,
      logger
    });
    const scores = classifyFrames(grayFrames, config.analysisWidth, config.analysisHeight);
    const intervals = buildIntervalsFromScores(scores, durationSec, config);
    return intervals;
  } catch (error) {
    if (logger) {
      logger.warn('AUTO B/C detection failed, falling back to mode B.', {
        message: error?.message
      });
    }
    return [{ mode: 'B', start: 0, end: durationSec }];
  }
}

export async function cutVerticalSegment({
  sourcePath,
  outputPath,
  startSec,
  endSec,
  width = 720,
  height = 1280,
  verticalAutoConfig,
  ffmpegBin = 'ffmpeg',
  logger
}) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const safeStart = Math.max(0, Number(startSec) || 0);
  const safeEnd = Math.max(safeStart + 0.4, Number(endSec) || safeStart + 0.4);

  const intervals = await detectAutoVerticalIntervals({
    sourcePath,
    startSec: safeStart,
    endSec: safeEnd,
    ffmpegBin,
    verticalAutoConfig,
    logger
  });

  const filter = buildFilterComplex(intervals, width, height);
  const args = [
    '-y',
    '-ss',
    normalizeTime(safeStart),
    '-to',
    normalizeTime(safeEnd),
    '-i',
    sourcePath,
    '-filter_complex',
    filter.filterComplex,
    '-map',
    filter.videoLabel,
    '-map',
    filter.audioLabel,
    '-r',
    '30',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '28',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    outputPath
  ];

  await runCommand(ffmpegBin, args, { logger });
  return outputPath;
}

export async function concatSegments({
  segmentPaths,
  outputPath,
  tempDir,
  ffmpegBin = 'ffmpeg',
  logger
}) {
  if (!Array.isArray(segmentPaths) || segmentPaths.length === 0) {
    throw new Error('Cannot concat without segment files.');
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(tempDir, { recursive: true });

  const listPath = path.resolve(tempDir, `concat-${Date.now()}.txt`);
  const content = `${segmentPaths.map((segPath) => `file '${segPath.replace(/'/g, "'\\''")}'`).join('\n')}\n`;
  await fs.writeFile(listPath, content, 'utf8');

  await runCommand(
    ffmpegBin,
    ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath],
    { logger }
  );

  return outputPath;
}
