try {
  const { env } = await import('../src/config/env.mjs');
  console.log('Healthcheck OK. Environment loaded.', {
    nodeEnv: env.NODE_ENV,
    storeDriver: env.STORE_DRIVER,
    queueDriver: env.QUEUE_DRIVER
  });
  process.exit(0);
} catch (error) {
  console.error('Healthcheck failed:', error.message);
  process.exit(1);
}
