import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

function commandError(command, args, code, stderr) {
  const rendered = [command, ...args].join(' ');
  const tail = String(stderr || '').trim();
  return new Error(`Command failed (${code}): ${rendered}${tail ? `\n${tail}` : ''}`);
}

function isYtDlpCommand(command = '') {
  return String(command).toLowerCase().includes('yt-dlp');
}

function hasBotConfirmationError(output = '') {
  const lowered = String(output).toLowerCase();
  return (
    lowered.includes("sign in to confirm you're not a bot") ||
    lowered.includes("sign in to confirm you’re not a bot")
  );
}

function friendlyYtDlpError() {
  return new Error(
    'YouTube requires cookies to download from this server. Set YTDLP_COOKIES_PATH in .env and upload cookies to that path.'
  );
}

function buildYtDlpCommonArgs({ ytDlpCookiesPath, ytDlpJsRuntime }) {
  const args = ['--no-playlist'];

  const cookiesPath = String(ytDlpCookiesPath || '').trim();
  if (cookiesPath) {
    args.push('--cookies', cookiesPath);
  }

  const jsRuntimePath = String(ytDlpJsRuntime || '').trim();
  if (jsRuntimePath) {
    const runtime = jsRuntimePath.startsWith('node:') ? jsRuntimePath : `node:${jsRuntimePath}`;
    args.push('--js-runtimes', runtime);
  }

  return args;
}

function runCommand(command, args, options = {}) {
  const { cwd, env, logger } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...(env || {}) },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      stdout += text;
      if (logger) {
        logger.debug(text.trim(), { command });
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      stderr += text;
      if (logger) {
        logger.debug(text.trim(), { command });
      }
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const combinedOutput = `${stdout}\n${stderr}`;
        if (isYtDlpCommand(command) && hasBotConfirmationError(combinedOutput)) {
          reject(friendlyYtDlpError());
          return;
        }
        reject(commandError(command, args, code, stderr));
      }
    });
  });
}

async function findFirstMatch(dirPath, prefixes) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const name = entry.name.toLowerCase();
    if (prefixes.some((prefix) => name.startsWith(prefix))) {
      return path.resolve(dirPath, entry.name);
    }
  }

  return null;
}

export async function downloadAudioOnly({
  url,
  workDir,
  ytDlpBin = 'yt-dlp',
  ytDlpCookiesPath = process.env.YTDLP_COOKIES_PATH,
  ytDlpJsRuntime = process.env.YTDLP_JS_RUNTIME,
  logger
}) {
  await fs.mkdir(workDir, { recursive: true });
  const outputTemplate = path.resolve(workDir, 'audio.%(ext)s');
  const ytDlpArgs = [
    ...buildYtDlpCommonArgs({
      ytDlpCookiesPath,
      ytDlpJsRuntime
    }),
    '-f',
    'bestaudio',
    '-o',
    outputTemplate,
    url
  ];

  await runCommand(ytDlpBin, ytDlpArgs, { cwd: workDir, logger });

  const downloadedPath = await findFirstMatch(workDir, ['audio.']);
  if (!downloadedPath) {
    throw new Error('Audio download finished but no output file was found.');
  }

  return downloadedPath;
}

export async function convertAudioToWav({
  inputPath,
  outputPath,
  ffmpegBin = 'ffmpeg',
  logger
}) {
  await runCommand(
    ffmpegBin,
    ['-y', '-i', inputPath, '-ac', '1', '-ar', '16000', outputPath],
    { logger }
  );
  return outputPath;
}

async function ensureMp4({ sourcePath, targetPath, ffmpegBin, logger }) {
  if (sourcePath.toLowerCase().endsWith('.mp4')) {
    if (sourcePath !== targetPath) {
      await fs.copyFile(sourcePath, targetPath);
    }
    return targetPath;
  }

  await runCommand(
    ffmpegBin,
    ['-y', '-i', sourcePath, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-b:a', '128k', targetPath],
    { logger }
  );
  return targetPath;
}

export async function downloadSourceVideo({
  url,
  workDir,
  ytDlpBin = 'yt-dlp',
  ytDlpCookiesPath = process.env.YTDLP_COOKIES_PATH,
  ytDlpJsRuntime = process.env.YTDLP_JS_RUNTIME,
  ffmpegBin = 'ffmpeg',
  logger
}) {
  await fs.mkdir(workDir, { recursive: true });
  const outputTemplate = path.resolve(workDir, 'source.%(ext)s');
  const ytDlpArgs = [
    ...buildYtDlpCommonArgs({
      ytDlpCookiesPath,
      ytDlpJsRuntime
    }),
    '-f',
    'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--merge-output-format',
    'mp4',
    '-o',
    outputTemplate,
    url
  ];

  await runCommand(ytDlpBin, ytDlpArgs, { cwd: workDir, logger });

  const downloadedPath = await findFirstMatch(workDir, ['source.']);
  if (!downloadedPath) {
    throw new Error('Video download finished but no source file was found.');
  }

  const sourceMp4Path = path.resolve(workDir, 'source.mp4');
  await ensureMp4({
    sourcePath: downloadedPath,
    targetPath: sourceMp4Path,
    ffmpegBin,
    logger
  });

  return sourceMp4Path;
}

export { runCommand };
