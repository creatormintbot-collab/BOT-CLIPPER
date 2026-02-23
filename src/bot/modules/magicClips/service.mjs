import { randomUUID } from 'node:crypto';
import { MAGIC_CLIPS_JOB_TYPE } from '../../../config/constants.mjs';
import { nowIso } from '../../../core/utils/time.mjs';

export function buildMagicClipsJob({ userId, chatId, state }) {
  const createdAt = nowIso();

  return {
    id: randomUUID(),
    type: MAGIC_CLIPS_JOB_TYPE,
    userId,
    chatId,
    status: 'queued',
    createdAt,
    payload: {
      urlOriginal: state.urlOriginal,
      urlNormalized: state.urlNormalized,
      targetLengthSec: state.targetLengthSec,
      outputMode: state.outputMode,
      createdAt,
      status: 'queued'
    }
  };
}

export async function queueMagicClipsJob({ job, queue, storage }) {
  await storage.set(`jobs.${job.id}`, job);
  await queue.add(job);
  return storage.get(`jobs.${job.id}`, job);
}
