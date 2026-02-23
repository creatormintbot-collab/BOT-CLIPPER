function cleanHost(hostname = '') {
  return String(hostname).toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
}

function isValidVideoId(videoId) {
  return typeof videoId === 'string' && /^[A-Za-z0-9_-]{6,}$/.test(videoId);
}

function extractVideoId(urlObject) {
  const host = cleanHost(urlObject.hostname);

  if (host === 'youtu.be') {
    return urlObject.pathname.split('/').filter(Boolean)[0] || null;
  }

  if (host === 'youtube.com') {
    if (urlObject.pathname === '/watch') {
      return urlObject.searchParams.get('v');
    }

    const parts = urlObject.pathname.split('/').filter(Boolean);
    if ((parts[0] === 'shorts' || parts[0] === 'embed') && parts[1]) {
      return parts[1];
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

  const host = cleanHost(parsed.hostname);
  const isYouTube = host === 'youtube.com' || host === 'youtu.be';
  if (!isYouTube) {
    return { ok: false, error: 'URL must be from YouTube (youtube.com or youtu.be).' };
  }

  const videoId = extractVideoId(parsed);
  if (!isValidVideoId(videoId)) {
    return {
      ok: false,
      error: 'Could not find a valid YouTube video id. Use youtube.com/watch?v=... or youtu.be/...'
    };
  }

  return {
    ok: true,
    originalUrl: rawUrl.trim(),
    normalizedUrl: `https://www.youtube.com/watch?v=${videoId}`,
    videoId
  };
}
