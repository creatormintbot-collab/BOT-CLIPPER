import path from 'node:path';

export function buildLocalUploadPlaceholder({ dataDir, jobId, clipName }) {
  const safeName = clipName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const relativePath = path.join('jobs', jobId, `${safeName || 'clip'}.mp4`);

  return {
    path: path.join(dataDir, relativePath),
    url: `local://${relativePath}`
  };
}
