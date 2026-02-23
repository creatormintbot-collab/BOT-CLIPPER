import { parseBoundedInteger } from '../../../core/utils/validate.mjs';
import { parseYouTubeUrl } from '../../../services/youtube/parseUrl.mjs';

export function validateYouTubeInput(rawUrl) {
  const parsed = parseYouTubeUrl(rawUrl);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  return {
    ok: true,
    urlOriginal: parsed.originalUrl,
    value: parsed.normalizedUrl,
    videoId: parsed.videoId
  };
}

export function validateTargetLength(rawValue) {
  const parsed = parseBoundedInteger(rawValue, 60, 90);
  if (parsed === null) {
    return { ok: false, error: 'Target length must be an integer between 60 and 90.' };
  }

  return { ok: true, value: parsed };
}

export function validateOutputMode(rawValue) {
  if (rawValue === 'single' || rawValue === 'variants') {
    return { ok: true, value: rawValue };
  }

  return { ok: false, error: 'Output mode must be either "single" or "variants".' };
}
