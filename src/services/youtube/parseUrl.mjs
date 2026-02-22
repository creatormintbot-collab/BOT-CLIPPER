function extractVideoId(urlObject) {
  const host = urlObject.hostname.toLowerCase();

  if (host === 'youtu.be') {
    return urlObject.pathname.replace(/^\//, '') || null;
  }

  if (host.includes('youtube.com')) {
    const fromQuery = urlObject.searchParams.get('v');
    if (fromQuery) {
      return fromQuery;
    }

    const parts = urlObject.pathname.split('/').filter(Boolean);
    const watchType = parts[0];
    if (watchType === 'shorts' || watchType === 'embed') {
      return parts[1] || null;
    }
  }

  return null;
}

export function parseYouTubeUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { ok: false, error: 'URL is required.' };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: 'Invalid URL format.' };
  }

  const host = parsed.hostname.toLowerCase();
  const isYouTube = host === 'youtu.be' || host.includes('youtube.com');

  if (!isYouTube) {
    return { ok: false, error: 'URL must be from YouTube (youtube.com or youtu.be).' };
  }

  return {
    ok: true,
    normalizedUrl: parsed.toString(),
    videoId: extractVideoId(parsed)
  };
}
