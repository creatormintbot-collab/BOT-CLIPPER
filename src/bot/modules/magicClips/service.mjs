import { randomUUID } from 'node:crypto';
import { MAGIC_CLIPS_JOB_TYPE } from '../../../config/constants.mjs';
import { nowIso } from '../../../core/utils/time.mjs';

export function buildMagicClipsJob({ userId, chatId, state }) {
  return {
    id: randomUUID(),
    type: MAGIC_CLIPS_JOB_TYPE,
    userId,
    chatId,
    status: 'queued',
    createdAt: nowIso(),
    payload: {
      url: state.url,
      clipCount: state.clipCount,
      maxDurationSec: state.maxDurationSec
    }
  };
}

export async function queueMagicClipsJob({ job, queue, storage }) {
  await storage.set(`jobs.${job.id}`, job);
  await queue.add(job);
  return job;
}

export function formatJobOutputList(outputs = []) {
  if (!Array.isArray(outputs) || outputs.length === 0) {
    return 'No clip outputs available.';
  }

  return outputs.map((item) => `- ${item.name}: ${item.url}`).join('\n');
}
