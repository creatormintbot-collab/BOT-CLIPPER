import { MAGIC_CLIPS_JOB_TYPE } from '../config/constants.mjs';
import { processMagicClipsJob } from './magicClips.worker.mjs';

export function registerWorkers({ queue, storage, logger }) {
  queue.process(async (job) => {
    if (job.type === MAGIC_CLIPS_JOB_TYPE) {
      return processMagicClipsJob(job, { storage, logger });
    }

    logger.warn('No worker registered for job type.', { type: job.type, jobId: job.id });
    return job;
  });
}
