import { parseBoundedInteger } from '../../../core/utils/validate.mjs';
import { parseYouTubeUrl } from '../../../services/youtube/parseUrl.mjs';

const VARIANT_DURATION_MIN = 45;
const VARIANT_DURATION_MAX = 180;

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

export function validateSingleTargetLength(rawValue) {
  const parsed = parseBoundedInteger(rawValue, 60, 90);
  if (parsed === null) {
    return { ok: false, error: 'Target length must be an integer between 60 and 90.' };
  }

  return { ok: true, value: parsed };
}

function validateVariantDuration(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < VARIANT_DURATION_MIN || parsed > VARIANT_DURATION_MAX) {
    return null;
  }
  return parsed;
}

const DEFAULT_KEYS = ['hot_take', 'checklist', 'story'];
const KEY_ALIASES = Object.freeze({
  hot: 'hot_take',
  hot_take: 'hot_take',
  hottake: 'hot_take',
  checklist: 'checklist',
  check: 'checklist',
  story: 'story'
});

function normalizePairInput(rawValue) {
  const parsed = {};
  const normalized = String(rawValue)
    .toLowerCase()
    .replace(/[,|]/g, ' ')
    .trim();

  if (!normalized) {
    return null;
  }

  const parts = normalized
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  for (let i = 0; i < parts.length; i += 1) {
    const token = parts[i];
    const match = token.match(/^(hot|hot_take|hottake|checklist|check|story)\s*[:=]?\s*(\d+)$/);
    if (match) {
      const key = KEY_ALIASES[match[1]];
      const value = validateVariantDuration(match[2]);
      if (!value) {
        return null;
      }
      parsed[key] = value;
      continue;
    }

    const key = KEY_ALIASES[token];
    if (!key) {
      continue;
    }
    const nextToken = parts[i + 1];
    const value = validateVariantDuration(nextToken);
    if (!value) {
      return null;
    }
    parsed[key] = value;
    i += 1;
  }

  if (DEFAULT_KEYS.every((key) => Number.isInteger(parsed[key]))) {
    return parsed;
  }

  return null;
}

export function validateVariantDurationsInput(rawValue) {
  const input = String(rawValue || '').trim();
  if (!input) {
    return { ok: false, error: 'Durations input is empty.' };
  }

  const csv = input
    .split(/[,\s/]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (csv.length === 3 && csv.every((item) => /^\d+$/.test(item))) {
    const [hotRaw, checklistRaw, storyRaw] = csv;
    const hot = validateVariantDuration(hotRaw);
    const checklist = validateVariantDuration(checklistRaw);
    const story = validateVariantDuration(storyRaw);
    if (!hot || !checklist || !story) {
      return {
        ok: false,
        error: `Each duration must be an integer from ${VARIANT_DURATION_MIN} to ${VARIANT_DURATION_MAX}.`
      };
    }
    return {
      ok: true,
      value: {
        hot_take: hot,
        checklist,
        story
      }
    };
  }

  const keyed = normalizePairInput(input);
  if (!keyed) {
    return {
      ok: false,
      error:
        'Custom durations format is invalid. Use `90,60,120` or `hot=90 checklist=60 story=120`.'
    };
  }

  return { ok: true, value: keyed };
}

export function validateOutputMode(rawValue) {
  if (rawValue === 'single' || rawValue === 'variants') {
    return { ok: true, value: rawValue };
  }

  return { ok: false, error: 'Output mode must be either "single" or "variants".' };
}
