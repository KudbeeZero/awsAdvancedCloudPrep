import { getOrCreateCoachSessionId } from './coachSession';

export type AudioLessonType = 'service' | 'lab' | 'flashcard' | 'coach';
export type AudioVoiceKey = 'rachel' | 'adam' | 'bella' | 'josh';

export interface VoiceCatalogItem {
  key: AudioVoiceKey;
  label: string;
  role: string;
}

export interface AudioStatusResponse {
  elevenLabsConfigured: boolean;
  deepSeekConfigured: boolean;
  geminiConfigured: boolean;
  sqlBacked: boolean;
  savedCount: number;
  totalBytes: number;
  voices: VoiceCatalogItem[];
}

export interface SavedAudioSummary {
  cacheKey: string;
  lessonType: AudioLessonType;
  lessonId: string;
  title: string;
  voiceKey: string;
  voiceLabel: string;
  scriptProvider: string;
  byteLength: number;
  playCount: number;
  createdAt: string;
}

export interface ProLessonAudioResponse {
  audioMode: 'elevenlabs' | 'browser-fallback';
  cachedInSql: boolean;
  newlyGenerated?: boolean;
  needsElevenLabsKey: boolean;
  upstreamStatus?: number;
  upstreamMessage?: string;
  cacheKey: string | null;
  audioUrl: string | null;
  scriptText: string;
  scriptProvider: 'deepseek' | 'gemini' | 'curated';
  audioProvider: 'elevenlabs' | 'browser-speech';
  voiceKey: AudioVoiceKey;
  voiceLabel: string;
  byteLength: number;
  playCount?: number;
}

export const AUDIO_SAVED_EVENT = 'cloudprep-audio-saved';
const VOICE_PREF_KEY = 'cloudprep_audio_voice_v1';

let cachedStatus: AudioStatusResponse | null = null;
let statusInFlight: Promise<AudioStatusResponse> | null = null;

export function getPreferredVoice(): AudioVoiceKey {
  if (typeof window === 'undefined') return 'rachel';
  try {
    const val = window.localStorage.getItem(VOICE_PREF_KEY);
    if (val === 'rachel' || val === 'adam' || val === 'bella' || val === 'josh') {
      return val;
    }
  } catch {
    // Ignore storage errors
  }
  return 'rachel';
}

export function setPreferredVoice(voice: AudioVoiceKey): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VOICE_PREF_KEY, voice);
  } catch {
    // Ignore storage errors
  }
}

export async function fetchAudioStatus(forceRefresh = false): Promise<AudioStatusResponse> {
  if (cachedStatus && !forceRefresh) {
    return cachedStatus;
  }
  if (statusInFlight && !forceRefresh) {
    return statusInFlight;
  }

  const request = fetch('/api/audio/status', { cache: 'no-store' })
    .then(async (res): Promise<AudioStatusResponse> => {
      if (!res.ok) throw new Error('Audio status unavailable');
      const data = (await res.json()) as AudioStatusResponse;
      cachedStatus = data;
      return data;
    })
    .catch((): AudioStatusResponse => ({
      elevenLabsConfigured: false,
      deepSeekConfigured: false,
      geminiConfigured: false,
      sqlBacked: true,
      savedCount: 0,
      totalBytes: 0,
      voices: [
        { key: 'rachel', label: 'Rachel', role: 'Clear Instructor' },
        { key: 'adam', label: 'Adam', role: 'Deep Narrator' },
        { key: 'bella', label: 'Bella', role: 'Upbeat Coach' },
        { key: 'josh', label: 'Josh', role: 'Exam Briefing' },
      ],
    }))
    .finally(() => {
      statusInFlight = null;
    });

  statusInFlight = request;
  return request;
}

export async function fetchSavedAudioSet(): Promise<Set<string>> {
  try {
    const res = await fetch('/api/audio/saved', { cache: 'no-store' });
    if (!res.ok) return new Set();
    const data = (await res.json()) as { items?: SavedAudioSummary[] };
    const keys = new Set<string>();
    for (const item of data.items || []) {
      keys.add(`${item.lessonType}:${item.lessonId}`);
    }
    return keys;
  } catch {
    return new Set();
  }
}

export async function requestProLessonAudio(params: {
  lessonType: AudioLessonType;
  lessonId: string;
  voiceKey: AudioVoiceKey;
  title: string;
  summary: string;
  facts?: string[];
  examTip?: string;
  forceRegenerate?: boolean;
  signal?: AbortSignal;
}): Promise<ProLessonAudioResponse> {
  const res = await fetch('/api/audio/lesson', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: getOrCreateCoachSessionId(),
      lessonType: params.lessonType,
      lessonId: params.lessonId,
      voiceKey: params.voiceKey,
      title: params.title,
      summary: params.summary,
      facts: params.facts || [],
      examTip: params.examTip || '',
      forceRegenerate: Boolean(params.forceRegenerate),
    }),
    signal: params.signal,
  });

  const data = (await res.json().catch(() => ({}))) as ProLessonAudioResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Audio request failed (${res.status}).`);
  }

  if (data.cachedInSql) {
    cachedStatus = null;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(AUDIO_SAVED_EVENT, {
          detail: { lessonType: params.lessonType, lessonId: params.lessonId },
        })
      );
    }
  }

  return data;
}
