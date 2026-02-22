import { toInteger } from './strings.mjs';

export function isIntegerInRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function parseBoundedInteger(rawValue, min, max) {
  const parsed = toInteger(rawValue);
  if (parsed === null || !isIntegerInRange(parsed, min, max)) {
    return null;
  }
  return parsed;
}
