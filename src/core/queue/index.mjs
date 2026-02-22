import { QUEUE_DRIVERS } from '../../config/constants.mjs';
import { createBullmqQueue } from './bullmqQueue.mjs';
import { createInMemoryQueue } from './inmemQueue.mjs';

export async function createQueue({ env, logger }) {
  if (env.QUEUE_DRIVER === QUEUE_DRIVERS.INMEM) {
    logger.info('Using in-memory queue driver.');
    return createInMemoryQueue({ logger });
  }

  if (env.QUEUE_DRIVER === QUEUE_DRIVERS.BULLMQ) {
    logger.info('Using BullMQ queue driver.');
    return createBullmqQueue({ env, logger });
  }

  throw new Error(`Unsupported queue driver: ${env.QUEUE_DRIVER}`);
}
