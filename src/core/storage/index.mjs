import { STORE_DRIVERS } from '../../config/constants.mjs';
import { createJsonStore } from './jsonStore.mjs';
import { createRedisStore } from './redisStore.mjs';

export async function createStorage({ env, logger }) {
  if (env.STORE_DRIVER === STORE_DRIVERS.JSON) {
    logger.info('Using JSON storage driver.', { dataDir: env.DATA_DIR });
    return createJsonStore({ dataDir: env.DATA_DIR, logger });
  }

  if (env.STORE_DRIVER === STORE_DRIVERS.REDIS) {
    logger.info('Using Redis storage driver.');
    return createRedisStore({ env, logger });
  }

  throw new Error(`Unsupported storage driver: ${env.STORE_DRIVER}`);
}
