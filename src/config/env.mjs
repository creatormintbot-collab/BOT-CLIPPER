import dotenv from 'dotenv';
import { QUEUE_DRIVERS, STORE_DRIVERS } from './constants.mjs';

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function withDefault(name, defaultValue) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : defaultValue;
}

function parsePositiveInteger(name, defaultValue) {
  const raw = withDefault(name, String(defaultValue));
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function parseAdminIds(value) {
  if (!value || !value.trim()) {
    return [];
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const parsed = Number(part);
      if (!Number.isInteger(parsed)) {
        throw new Error(`Invalid ADMIN_USER_IDS value: ${part}`);
      }
      return parsed;
    });
}

function assertOneOf(name, value, allowed) {
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  }
}

const STORE_DRIVER = withDefault('STORE_DRIVER', STORE_DRIVERS.JSON);
const QUEUE_DRIVER = withDefault('QUEUE_DRIVER', QUEUE_DRIVERS.INMEM);

assertOneOf('STORE_DRIVER', STORE_DRIVER, Object.values(STORE_DRIVERS));
assertOneOf('QUEUE_DRIVER', QUEUE_DRIVER, Object.values(QUEUE_DRIVERS));

export const env = Object.freeze({
  TELEGRAM_BOT_TOKEN: required('TELEGRAM_BOT_TOKEN'),
  NODE_ENV: withDefault('NODE_ENV', 'development'),
  ADMIN_USER_IDS: parseAdminIds(process.env.ADMIN_USER_IDS),
  STORE_DRIVER,
  QUEUE_DRIVER,
  DATA_DIR: withDefault('DATA_DIR', './data'),
  PYTHON_BIN: withDefault('PYTHON_BIN', 'python3'),
  WHISPER_MODEL: withDefault('WHISPER_MODEL', 'small'),
  WHISPER_LANGUAGE: withDefault('WHISPER_LANGUAGE', 'id'),
  OUTPUT_WIDTH: parsePositiveInteger('OUTPUT_WIDTH', 720),
  OUTPUT_HEIGHT: parsePositiveInteger('OUTPUT_HEIGHT', 1280)
});
