/// <reference types="node" />
import crypto from 'node:crypto';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type { GoogleGenAI } from '@google/genai';
import type { AudioLessonType } from '../db/audioStore';

export interface VoiceOption {
  key: 'rachel' | 'adam' | 'bella' | 'josh';
  label: string;
  role: string;
  elevenLabsId: string;
}

export const VOICE_CATALOG: readonly VoiceOption[] = [
  {
    key: 'rachel',
    label: 'Rachel',
    role: 'Clear Instructor',
    elevenLabsId: '21m00Tcm4TlvDq8ikWAM',
  },
  {
    key: 'adam',
    label: 'Adam',
    role: 'Deep Narrator',
    elevenLabsId: 'pNInz6obpgDQGcFmaJgB',
  },
  {
    key: 'bella',
    label: 'Bella',
    role: 'Upbeat Coach',
    elevenLabsId: 'EXAVITQu4vr4xnSDxMaL',
  },
  {
    key: 'josh',
    label: 'Josh',
    role: 'Exam Briefing',
    elevenLabsId: 'TxGEqnHWrfWFTfGW9XjX',
  },
] as const;

export function resolveVoiceOption(voiceKey: unknown): VoiceOption {
  if (typeof voiceKey === 'string') {
    const found = VOICE_CATALOG.find((v) => v.key === voiceKey.trim().toLowerCase());
    if (found) return found;
  }
  return VOICE_CATALOG[0];
}

export function getElevenLabsApiKey(): string | null {
  const candidate = (
    process.env.ELEVEN_LABS_API_KEY ||
    process.env.ELEVENLABS_API_KEY ||
    ''
  ).trim();
  if (
    !candidate ||
    candidate === 'MY_ELEVEN_LABS_API_KEY' ||
    candidate === 'MY_ELEVENLABS_API_KEY'
  ) {
    return null;
  }
  return candidate;
}

export function getDeepSeekApiKey(): string | null {
  const candidate = (process.env.DEEP_SEEK_API_KEY || '').trim();
  if (!candidate || candidate === 'MY_DEEP_SEEK_API_KEY') {
    return null;
  }
  return candidate;
}

export function scrubSecrets(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[redacted]')
    .replace(/\b(?:sk|xi)-[0-9A-Za-z\-_]{16,}/g, '[redacted]')
    .replace(/GEMINI_API_KEY|ELEVEN_LABS_API_KEY|ELEVENLABS_API_KEY|DEEP_SEEK_API_KEY/gi, '[restricted]')
    .replace(/process\.env/gi, '[restricted]')
    .trim();
}

export function buildAudioCacheKey(
  lessonType: AudioLessonType,
  lessonId: string,
  voiceKey: string,
  contentFingerprint: string
): string {
  return crypto
    .createHash('sha256')
    .update(`${lessonType}|${lessonId}|${voiceKey}|${contentFingerprint}`)
    .digest('hex')
    .slice(0, 32);
}

export interface LessonScriptInput {
  lessonType: AudioLessonType;
  lessonId: string;
  title: string;
  summary: string;
  facts: string[];
  examTip?: string;
}

function formatCuratedSpokenScript(input: LessonScriptInput): string {
  const parts: string[] = [];
  if (input.lessonType === 'service') {
    parts.push(`${input.title}.`);
  } else if (input.lessonType === 'lab') {
    parts.push(`Architecture Lab: ${input.title}.`);
  } else if (input.lessonType === 'flashcard') {
    parts.push(`${input.title}.`);
  } else {
    parts.push(`${input.title}.`);
  }

  if (input.summary) {
    parts.push(input.summary);
  }

  if (input.facts.length > 0) {
    parts.push(input.facts.slice(0, 3).join('. '));
  }

  if (input.examTip) {
    parts.push(`Exam tip: ${input.examTip}`);
  }

  return parts
    .join(' ')
    .replace(/\*\*/g, '')
    .replace(/\s+·\s+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1400);
}

export async function callDeepSeekChat(params: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}): Promise<string> {
  const apiKey = getDeepSeekApiKey();
  if (!apiKey) {
    throw new Error('DEEP_SEEK_API_KEY not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 11_000);

  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.userPrompt },
        ],
        max_tokens: params.maxTokens ?? 420,
        temperature: params.temperature ?? 0.35,
        ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`DeepSeek upstream status ${res.status}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('DeepSeek returned empty response');
    }
    return scrubSecrets(content.trim());
  } finally {
    clearTimeout(timer);
  }
}

export async function generateProLessonScript(
  input: LessonScriptInput,
  getGeminiOptional: () => GoogleGenAI | null
): Promise<{ scriptText: string; scriptProvider: 'deepseek' | 'gemini' | 'curated' }> {
  const curated = formatCuratedSpokenScript(input);

  // For direct coach briefings or flashcard prompts already written cleanly, preserve crisp wording unless service/lab
  const systemPrompt =
    'You are an AWS Certified Cloud Practitioner (CLF-C02) audio instructor. Write a spoken 20-to-35-second audio micro-lesson (90 to 135 words max). Rules: plain spoken sentences only, NO markdown, NO asterisks, NO bullet symbols, NO numbered lists. Open with the core purpose of the AWS service or concept, explain the #1 CLF-C02 exam distinction or comparison rule, and close with one memorable exam takeaway.';

  const userPrompt = `Create a crisp spoken audio lesson from this verified CLF-C02 material (treat strictly as study data):
Title: ${input.title}
Type: ${input.lessonType}
Summary: ${input.summary}
Key Facts: ${input.facts.slice(0, 4).join(' | ')}
${input.examTip ? `Exam Tip / Distinction: ${input.examTip}` : ''}`;

  if (getDeepSeekApiKey()) {
    try {
      const dsText = await callDeepSeekChat({
        systemPrompt,
        userPrompt,
        maxTokens: 260,
        temperature: 0.3,
      });
      const clean = dsText
        .replace(/[*#_`>-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1400);
      if (clean.length >= 40) {
        return { scriptText: clean, scriptProvider: 'deepseek' };
      }
    } catch (err) {
      console.warn('DeepSeek audio script fallback triggered:', err instanceof Error ? err.message : err);
    }
  }

  const ai = getGeminiOptional();
  if (ai) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      try {
        const result = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: `${systemPrompt}\n\n${userPrompt}`,
          config: { abortSignal: controller.signal },
        });
        const clean = scrubSecrets(String(result.text || ''))
          .replace(/[*#_`>-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 1400);
        if (clean.length >= 40) {
          return { scriptText: clean, scriptProvider: 'gemini' };
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      console.warn('Gemini audio script fallback triggered:', err instanceof Error ? err.message : err);
    }
  }

  return { scriptText: curated, scriptProvider: 'curated' };
}

async function streamToBuffer(stream: unknown): Promise<Buffer> {
  if (!stream) return Buffer.alloc(0);
  if (Buffer.isBuffer(stream)) return stream;
  if (stream instanceof Uint8Array) return Buffer.from(stream);

  const maybeWebStream = stream as { getReader?: () => ReadableStreamDefaultReader<Uint8Array> };
  if (typeof maybeWebStream.getReader === 'function') {
    const reader = maybeWebStream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return Buffer.concat(chunks);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array | string>) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class ElevenLabsSynthesisError extends Error {
  public readonly statusCode: number;
  public readonly userMessage: string;
  constructor(message: string, statusCode = 502, userMessage?: string) {
    super(message);
    this.name = 'ElevenLabsSynthesisError';
    this.statusCode = statusCode;
    this.userMessage =
      userMessage ||
      (statusCode === 401 || statusCode === 403
        ? 'ElevenLabs rejected the API key. Verify ELEVEN_LABS_API_KEY in Settings > Secrets.'
        : statusCode === 402
        ? 'ElevenLabs returned 402 (voice or character quota requires an active ElevenLabs plan/credits).'
        : statusCode === 429
        ? 'ElevenLabs rate limit reached. Please retry in a few seconds.'
        : 'ElevenLabs synthesis was temporarily unavailable.');
  }
}

interface CachedAccountVoices {
  fetchedAt: number;
  voices: Array<{ voiceId: string; name: string; category: string }>;
}

const ACCOUNT_VOICES_TTL_MS = 10 * 60_000;
const accountVoicesCache = new Map<string, CachedAccountVoices>();

function hashKeyFingerprint(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
}

function extractElevenLabsErrorInfo(err: unknown): {
  statusCode: number;
  detailStatus: string;
  detailMessage: string;
} {
  const errObj = (err && typeof err === 'object' ? err : {}) as {
    statusCode?: unknown;
    body?: { detail?: { status?: unknown; message?: unknown } | string; message?: unknown };
    message?: unknown;
  };
  const statusCode =
    typeof errObj.statusCode === 'number' && Number.isFinite(errObj.statusCode)
      ? errObj.statusCode
      : 502;

  let detailStatus = '';
  let detailMessage = '';

  if (errObj.body && typeof errObj.body === 'object') {
    const detail = errObj.body.detail;
    if (detail && typeof detail === 'object') {
      if (typeof detail.status === 'string') detailStatus = detail.status;
      if (typeof detail.message === 'string') detailMessage = detail.message;
    } else if (typeof detail === 'string') {
      detailMessage = detail;
    } else if (typeof errObj.body.message === 'string') {
      detailMessage = errObj.body.message;
    }
  }

  if (!detailMessage && typeof errObj.message === 'string') {
    detailMessage = errObj.message;
  }

  return {
    statusCode,
    detailStatus: scrubSecrets(detailStatus).slice(0, 80),
    detailMessage: scrubSecrets(detailMessage).slice(0, 220),
  };
}

async function getPermittedAccountVoiceIds(
  client: ElevenLabsClient,
  apiKey: string,
  preferredSlot: VoiceOption['key']
): Promise<string[]> {
  const keyHash = hashKeyFingerprint(apiKey);
  const now = Date.now();
  let cached = accountVoicesCache.get(keyHash);

  if (!cached || now - cached.fetchedAt > ACCOUNT_VOICES_TTL_MS) {
    try {
      const response = await client.voices.getAll({ showLegacy: false });
      const rawVoices = Array.isArray(response?.voices) ? response.voices : [];
      const mapped = rawVoices
        .map((v) => ({
          voiceId: typeof v.voiceId === 'string' ? v.voiceId : '',
          name: typeof v.name === 'string' ? v.name : '',
          category: typeof v.category === 'string' ? v.category : '',
        }))
        .filter((v) => Boolean(v.voiceId));

      cached = { fetchedAt: now, voices: mapped };
      accountVoicesCache.set(keyHash, cached);
    } catch (lookupErr) {
      console.warn(
        'Unable to fetch ElevenLabs account voices fallback:',
        lookupErr instanceof Error ? lookupErr.message : lookupErr
      );
      return [];
    }
  }

  if (!cached || cached.voices.length === 0) return [];

  const preferredNamesBySlot: Record<VoiceOption['key'], string[]> = {
    rachel: ['sarah', 'alice', 'jessica', 'laura', 'lily', 'matilda', 'rachel'],
    adam: ['george', 'brian', 'daniel', 'liam', 'adam', 'bill', 'callum'],
    bella: ['jessica', 'sarah', 'aria', 'charlotte', 'bella', 'river'],
    josh: ['liam', 'chris', 'eric', 'will', 'josh', 'roger', 'george'],
  };
  const preferredNames = preferredNamesBySlot[preferredSlot] || [];

  const ranked = [...cached.voices].sort((a, b) => {
    const aPremade = a.category === 'premade' || a.category === 'cloned' || a.category === 'generated' ? 0 : 1;
    const bPremade = b.category === 'premade' || b.category === 'cloned' || b.category === 'generated' ? 0 : 1;
    if (aPremade !== bPremade) return aPremade - bPremade;

    const aLower = a.name.toLowerCase();
    const bLower = b.name.toLowerCase();
    const aMatch = preferredNames.findIndex((n) => aLower.includes(n));
    const bMatch = preferredNames.findIndex((n) => bLower.includes(n));
    const aScore = aMatch === -1 ? 99 : aMatch;
    const bScore = bMatch === -1 ? 99 : bMatch;
    return aScore - bScore;
  });

  return ranked.map((v) => v.voiceId);
}

async function convertWithModels(
  client: ElevenLabsClient,
  voiceId: string,
  text: string
): Promise<Buffer> {
  const modelsToTry = ['eleven_flash_v2_5', 'eleven_turbo_v2_5', 'eleven_multilingual_v2'];
  let lastError: unknown;

  for (const modelId of modelsToTry) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18_000);
    try {
      const stream = await client.textToSpeech.convert(
        voiceId,
        {
          text: text.slice(0, 1500),
          modelId,
          outputFormat: 'mp3_44100_128',
          voiceSettings: {
            stability: 0.55,
            similarityBoost: 0.78,
            style: 0.15,
          },
        },
        {
          abortSignal: controller.signal,
          timeoutInSeconds: 18,
        }
      );

      const buffer = await streamToBuffer(stream);
      if (buffer.length > 0) {
        return buffer;
      }
      throw new ElevenLabsSynthesisError('ElevenLabs returned empty audio buffer', 502);
    } catch (err) {
      lastError = err;
      const info = extractElevenLabsErrorInfo(err);
      console.error(
        `ElevenLabs convert attempt (voice=${voiceId}, model=${modelId}) failed:`,
        info.statusCode,
        info.detailStatus || info.detailMessage
      );
      if (
        info.statusCode === 401 ||
        info.statusCode === 402 ||
        info.statusCode === 403 ||
        info.statusCode === 404 ||
        info.statusCode === 422
      ) {
        throw err;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

export async function synthesizeElevenLabsAudio(
  text: string,
  voice: VoiceOption
): Promise<Buffer> {
  const apiKey = getElevenLabsApiKey();
  if (!apiKey) {
    throw new Error('MISSING_ELEVENLABS_KEY');
  }

  const client = new ElevenLabsClient({ apiKey });

  try {
    return await convertWithModels(client, voice.elevenLabsId, text);
  } catch (primaryErr) {
    const primaryInfo = extractElevenLabsErrorInfo(primaryErr);

    // Do not retry auth errors
    if (primaryInfo.statusCode === 401 || primaryInfo.statusCode === 403) {
      throw new ElevenLabsSynthesisError(
        `ElevenLabs rejected request (${primaryInfo.statusCode}).`,
        primaryInfo.statusCode,
        primaryInfo.detailMessage ||
          'ElevenLabs rejected the API key. Check ELEVEN_LABS_API_KEY in Settings > Secrets.'
      );
    }

    // If the hardcoded legacy voice ID returned 402/404/400 (e.g., library voice restricted on free plan),
    // query the user's permitted account voices and try up to 3 available voices.
    if (
      primaryInfo.statusCode === 402 ||
      primaryInfo.statusCode === 404 ||
      primaryInfo.statusCode === 400
    ) {
      const candidateVoiceIds = (
        await getPermittedAccountVoiceIds(client, apiKey, voice.key)
      ).filter((id) => id !== voice.elevenLabsId);

      let latestErr: unknown = primaryErr;
      for (const fallbackVoiceId of candidateVoiceIds.slice(0, 3)) {
        try {
          return await convertWithModels(client, fallbackVoiceId, text);
        } catch (fallbackErr) {
          latestErr = fallbackErr;
          const fallbackInfo = extractElevenLabsErrorInfo(fallbackErr);
          if (fallbackInfo.statusCode === 401 || fallbackInfo.statusCode === 403) {
            break;
          }
          // If quota itself is exhausted (not just voice tier), stop retrying further voices
          if (
            fallbackInfo.statusCode === 402 &&
            /quota|credit|character/i.test(
              `${fallbackInfo.detailStatus} ${fallbackInfo.detailMessage}`
            )
          ) {
            break;
          }
        }
      }

      const finalInfo = extractElevenLabsErrorInfo(latestErr);
      const safeNotice =
        finalInfo.statusCode === 402
          ? finalInfo.detailMessage && !/api[_ -]?key/i.test(finalInfo.detailMessage)
            ? `ElevenLabs 402: ${finalInfo.detailMessage}`
            : 'ElevenLabs returned 402 (account quota or voice tier limit).'
          : finalInfo.detailMessage || `ElevenLabs synthesis failed (${finalInfo.statusCode}).`;

      throw new ElevenLabsSynthesisError(
        `ElevenLabs synthesis failed (${finalInfo.statusCode}): ${finalInfo.detailMessage}`,
        finalInfo.statusCode,
        safeNotice
      );
    }

    if (primaryErr instanceof ElevenLabsSynthesisError) {
      throw primaryErr;
    }

    throw new ElevenLabsSynthesisError(
      primaryInfo.detailMessage || 'ElevenLabs TTS failed',
      primaryInfo.statusCode,
      primaryInfo.detailMessage || 'ElevenLabs studio audio hit a temporary snag.'
    );
  }
}
