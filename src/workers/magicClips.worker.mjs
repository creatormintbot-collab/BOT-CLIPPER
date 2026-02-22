import { nowIso, randomInt, sleep } from '../core/utils/time.mjs';

export async function processMagicClipsJob(job, { storage, logger }) {
  await storage.update(`jobs.${job.id}`, (current = {}) => ({
    ...current,
    status: 'running',
    startedAt: nowIso()
  }));

  logger.info('Processing Magic Clips job (stub).', { jobId: job.id });
  await sleep(randomInt(1000, 2000));

  const outputs = [
    { name: 'Clip 1', url: 'TODO' },
    { name: 'Clip 2', url: 'TODO' },
    { name: 'Clip 3', url: 'TODO' }
  ];

  const completed = await storage.update(`jobs.${job.id}`, (current = {}) => ({
    ...current,
    status: 'completed',
    completedAt: nowIso(),
    outputs
  }));

  logger.info('Magic Clips job completed (stub).', { jobId: job.id });
  return completed;
}
