export async function notifyAdmins({ bot, env, message, logger }) {
  if (!Array.isArray(env.ADMIN_USER_IDS) || env.ADMIN_USER_IDS.length === 0) {
    return;
  }

  await Promise.all(
    env.ADMIN_USER_IDS.map(async (adminId) => {
      try {
        await bot.telegram.sendMessage(adminId, message);
      } catch (error) {
        logger.warn('Failed to notify admin.', {
          adminId,
          error: error?.message
        });
      }
    })
  );
}
