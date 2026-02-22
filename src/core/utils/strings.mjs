export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normalizeWhitespace(value) {
  if (!isNonEmptyString(value)) {
    return '';
  }
  return value.trim().replace(/\s+/g, ' ');
}

export function toInteger(value) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (!isNonEmptyString(String(value))) {
    return null;
  }

  const parsed = Number(String(value).trim());
  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}
