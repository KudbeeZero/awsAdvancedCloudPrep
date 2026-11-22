const OFFLINE_AUDIO_CACHE_NAME = 'cloudprep-offline-audio-v1';

export function isOfflineCacheSupported(): boolean {
  return typeof window !== 'undefined' && 'caches' in window;
}

export async function isAudioCachedOffline(audioUrl: string): Promise<boolean> {
  if (!isOfflineCacheSupported() || !audioUrl) return false;
  try {
    const cache = await window.caches.open(OFFLINE_AUDIO_CACHE_NAME);
    const match = await cache.match(audioUrl);
    return Boolean(match);
  } catch {
    return false;
  }
}

export async function saveAudioOffline(audioUrl: string): Promise<boolean> {
  if (!isOfflineCacheSupported() || !audioUrl) return false;
  try {
    const cache = await window.caches.open(OFFLINE_AUDIO_CACHE_NAME);
    const existing = await cache.match(audioUrl);
    if (existing) return true;

    const response = await fetch(audioUrl, { credentials: 'same-origin' });
    if (!response.ok) return false;
    await cache.put(audioUrl, response.clone());
    return true;
  } catch {
    return false;
  }
}

export async function removeAudioOffline(audioUrl: string): Promise<void> {
  if (!isOfflineCacheSupported() || !audioUrl) return;
  try {
    const cache = await window.caches.open(OFFLINE_AUDIO_CACHE_NAME);
    await cache.delete(audioUrl);
  } catch {
    // Ignore cache deletion errors
  }
}

export async function resolvePlayableAudioUrl(
  audioUrl: string
): Promise<{ src: string; isObjectUrl: boolean; isOfflineCached: boolean }> {
  if (!isOfflineCacheSupported() || !audioUrl) {
    return { src: audioUrl, isObjectUrl: false, isOfflineCached: false };
  }
  try {
    const cache = await window.caches.open(OFFLINE_AUDIO_CACHE_NAME);
    const match = await cache.match(audioUrl);
    if (!match) {
      return { src: audioUrl, isObjectUrl: false, isOfflineCached: false };
    }
    const blob = await match.blob();
    if (!blob || blob.size === 0) {
      return { src: audioUrl, isObjectUrl: false, isOfflineCached: false };
    }
    return {
      src: URL.createObjectURL(blob),
      isObjectUrl: true,
      isOfflineCached: true,
    };
  } catch {
    return { src: audioUrl, isObjectUrl: false, isOfflineCached: false };
  }
}
