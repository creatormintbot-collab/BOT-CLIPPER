const LEVELS = ['debug', 'info', 'warn', 'error'];

function shouldLog(currentLevel, level) {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(currentLevel);
}

function serializeMeta(meta) {
  if (meta === undefined) {
    return '';
  }

  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ' [meta_unserializable]';
  }
}

export function createLogger({ name = 'bot-clipper', level } = {}) {
  const resolvedLevel = level || (process.env.NODE_ENV === 'development' ? 'debug' : 'info');

  function log(levelName, message, meta) {
    if (!shouldLog(resolvedLevel, levelName)) {
      return;
    }

    const line = `[${new Date().toISOString()}] [${name}] [${levelName}] ${message}${serializeMeta(meta)}`;

    if (levelName === 'error') {
      console.error(line);
      return;
    }

    if (levelName === 'warn') {
      console.warn(line);
      return;
    }

    console.log(line);
  }

  return {
    debug: (message, meta) => log('debug', message, meta),
    info: (message, meta) => log('info', message, meta),
    warn: (message, meta) => log('warn', message, meta),
    error: (message, meta) => log('error', message, meta)
  };
}
