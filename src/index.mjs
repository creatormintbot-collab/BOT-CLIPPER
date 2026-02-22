import { env } from './config/env.mjs';
import { registerRouter } from './bot/router.mjs';
import { createBot } from './bot/bot.mjs';
import { createRateLimitMiddleware } from './bot/middlewares/rateLimit.mjs';
import { createSessionMiddleware } from './bot/middlewares/session.mjs';
import { createLogger } from './core/logger.mjs';
import { createQueue } from './core/queue/index.mjs';
import { createStorage } from './core/storage/index.mjs';
import { registerWorkers } from './workers/index.mjs';

const logger = createLogger({ name: 'bot-clipper' });

async function bootstrap() {
  const storage = await createStorage({ env, logger });
  const queue = await createQueue({ env, logger });
  const bot = createBot({ env, logger });

  const deps = { env, logger, storage, queue };

  bot.use(createSessionMiddleware({ storage, logger }));
  bot.use(createRateLimitMiddleware({ logger }));

  registerWorkers({ queue, storage, logger });
  registerRouter(bot, deps);

  await bot.launch();
  logger.info('Bot launched with long polling.');

  const shutdown = (signal) => {
    logger.info('Shutting down bot.', { signal });
    bot.stop(signal);
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  logger.error('Failed to bootstrap application.', {
    message: error?.message,
    stack: error?.stack
  });
  process.exit(1);
});
