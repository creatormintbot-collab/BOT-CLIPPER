import fs from 'node:fs/promises';
import path from 'node:path';
import { runCommand } from '../youtube/download.mjs';

function normalizeTime(value) {
  const safe = Number(value);
  if (!Number.isFinite(safe) || safe < 0) {
    return '0.000';
  }
  return safe.toFixed(3);
}

export async function cutVerticalSegment({
  sourcePath,
  outputPath,
  startSec,
  endSec,
  width = 720,
  height = 1280,
  ffmpegBin = 'ffmpeg',
  logger
}) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const safeStart = Math.max(0, Number(startSec) || 0);
  const safeEnd = Math.max(safeStart + 0.4, Number(endSec) || safeStart + 0.4);

  const filters = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  await runCommand(
    ffmpegBin,
    [
      '-y',
      '-ss',
      normalizeTime(safeStart),
      '-to',
      normalizeTime(safeEnd),
      '-i',
      sourcePath,
      '-vf',
      filters,
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
    ],
    { logger }
  );

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
