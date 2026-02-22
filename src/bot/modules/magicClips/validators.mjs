import { parseBoundedInteger } from '../../../core/utils/validate.mjs';
import { parseYouTubeUrl } from '../../../services/youtube/parseUrl.mjs';

export function validateYouTubeInput(rawUrl) {
  const parsed = parseYouTubeUrl(rawUrl);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  return {
    ok: true,
    value: parsed.normalizedUrl,
    videoId: parsed.videoId
  };
}

export function validateClipCount(rawValue) {
  const parsed = parseBoundedInteger(rawValue, 1, 20);
  if (parsed === null) {
    return { ok: false, error: 'Clip count must be a number between 1 and 20.' };
  }

  return { ok: true, value: parsed };
}

export function validateMaxDuration(rawValue) {
  const parsed = parseBoundedInteger(rawValue, 5, 300);
  if (parsed === null) {
    return { ok: false, error: 'Max duration must be a number between 5 and 300 seconds.' };
  }

  return { ok: true, value: parsed };
}
