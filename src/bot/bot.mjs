import { Telegraf } from 'telegraf';

export function createBot({ env, logger }) {
  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

  bot.catch((error, ctx) => {
    logger.error('Unhandled Telegraf error.', {
      message: error?.message,
      updateType: ctx?.updateType
    });
  });

  return bot;
}
