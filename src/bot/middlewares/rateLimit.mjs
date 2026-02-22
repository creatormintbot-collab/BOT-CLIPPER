import { messages } from '../ui/messages.mjs';

const INTERVAL_MS = 300;
const BURST = 5;
const buckets = new Map();

function getBucket(userId, now) {
  const current = buckets.get(userId);
  if (!current) {
    const initial = { tokens: BURST - 1, lastRefill: now };
    buckets.set(userId, initial);
    return initial;
  }

  const elapsed = now - current.lastRefill;
  current.tokens = Math.min(BURST, current.tokens + elapsed / INTERVAL_MS);
  current.lastRefill = now;
  return current;
}

async function replyLimited(ctx) {
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery(messages.rateLimit).catch(() => {});
    return;
  }

  await ctx.reply(messages.rateLimit).catch(() => {});
}

export function createRateLimitMiddleware({ logger }) {
  return async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!Number.isInteger(userId)) {
      return next();
    }

    const now = Date.now();
    const bucket = getBucket(userId, now);

    if (bucket.tokens < 1) {
      logger.debug('Rate limited update.', { userId });
      await replyLimited(ctx);
      return;
    }

    bucket.tokens -= 1;
    await next();
  };
}
