export function createAuthHelpers({ env }) {
  const adminIds = new Set(env.ADMIN_USER_IDS);

  return {
    isAdmin(userId) {
      if (!Number.isInteger(userId)) {
        return false;
      }
      return adminIds.has(userId);
    }
  };
}

export function authMiddleware() {
  return async (_ctx, next) => next();
}
