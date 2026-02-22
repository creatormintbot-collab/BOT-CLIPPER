function getSessionKey(ctx) {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;

  if (!Number.isInteger(chatId) || !Number.isInteger(userId)) {
    return null;
  }

  return `${chatId}:${userId}`;
}

export function createSessionMiddleware({ storage, logger }) {
  return async (ctx, next) => {
    const sessionKey = getSessionKey(ctx);

    if (!sessionKey) {
      await next();
      return;
    }

    const storeKey = `sessions.${sessionKey}`;
    const existing = (await storage.get(storeKey, {})) || {};

    ctx.state = ctx.state || {};
    ctx.state.session = typeof existing === 'object' ? existing : {};

    const before = JSON.stringify(ctx.state.session);

    await next();

    const after = JSON.stringify(ctx.state.session || {});
    if (before !== after) {
      await storage.set(storeKey, ctx.state.session || {});
      logger.debug('Session persisted.', { sessionKey });
    }
  };
}
