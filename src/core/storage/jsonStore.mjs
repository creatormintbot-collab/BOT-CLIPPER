import fs from 'node:fs/promises';
import path from 'node:path';

function pathParts(key) {
  if (!key) {
    return [];
  }
  return String(key)
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
}

function deepClone(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function getAtPath(source, key, defaultValue) {
  if (!key) {
    return source;
  }

  let cursor = source;
  for (const part of pathParts(key)) {
    if (!cursor || typeof cursor !== 'object' || !(part in cursor)) {
      return defaultValue;
    }
    cursor = cursor[part];
  }

  return cursor;
}

function setAtPath(target, key, value) {
  const parts = pathParts(key);
  if (parts.length === 0) {
    return value;
  }

  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!cursor[part] || typeof cursor[part] !== 'object') {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }

  cursor[parts[parts.length - 1]] = value;
  return target;
}

export class JsonStore {
  constructor({ dataDir, fileName = 'state.json', logger }) {
    this.logger = logger;
    this.filePath = path.resolve(dataDir, fileName);
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      await fs.access(this.filePath);
    } catch {
      await this.#writeState({});
    }

    return this;
  }

  async #readState() {
    const raw = await fs.readFile(this.filePath, 'utf8');
    if (!raw.trim()) {
      return {};
    }
    return JSON.parse(raw);
  }

  async #writeState(state) {
    const tempPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    const payload = `${JSON.stringify(state, null, 2)}\n`;

    await fs.writeFile(tempPath, payload, 'utf8');
    await fs.rename(tempPath, this.filePath);
  }

  async get(key, defaultValue = undefined) {
    const state = await this.#readState();
    const value = getAtPath(state, key, defaultValue);
    return deepClone(value);
  }

  async set(key, value) {
    const state = await this.#readState();
    const nextState = setAtPath(state, key, value);
    await this.#writeState(nextState);
    return deepClone(value);
  }

  async update(key, updater) {
    const state = await this.#readState();
    const current = getAtPath(state, key, undefined);
    const nextValue = await updater(deepClone(current));
    const nextState = setAtPath(state, key, nextValue);
    await this.#writeState(nextState);
    return deepClone(nextValue);
  }
}

export async function createJsonStore(options) {
  const store = new JsonStore(options);
  return store.init();
}
