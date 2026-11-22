/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type AudioLessonType = 'service' | 'lab' | 'flashcard' | 'coach';

export interface StoredLessonAudio {
  cacheKey: string;
  lessonType: AudioLessonType;
  lessonId: string;
  title: string;
  voiceKey: string;
  voiceLabel: string;
  scriptProvider: 'deepseek' | 'gemini' | 'curated';
  audioProvider: 'elevenlabs';
  scriptText: string;
  mimeType: string;
  audioBuffer: Buffer;
  byteLength: number;
  playCount: number;
  createdAt: string;
  lastPlayedAt: string;
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

const MAX_CACHE_ROWS = 400;
const MAX_CACHE_BYTES = 250 * 1024 * 1024; // 250 MB safety cap

const DB_DIR = path.resolve(process.cwd(), '.data');
const DB_PATH = path.join(DB_DIR, 'cloudprep_audio.db');

let dbInstance: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS lesson_audio_cache (
      cache_key TEXT PRIMARY KEY,
      lesson_type TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      title TEXT NOT NULL,
      voice_key TEXT NOT NULL,
      voice_label TEXT NOT NULL,
      script_provider TEXT NOT NULL,
      audio_provider TEXT NOT NULL DEFAULT 'elevenlabs',
      script_text TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'audio/mpeg',
      audio_blob BLOB NOT NULL,
      byte_length INTEGER NOT NULL,
      play_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_played_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_lesson_audio_lookup
      ON lesson_audio_cache (lesson_type, lesson_id, voice_key, last_played_at DESC);
  `);

  dbInstance = db;
  return db;
}

function mapRowToStoredAudio(row: Record<string, unknown>): StoredLessonAudio | null {
  if (!row || typeof row.cache_key !== 'string') return null;
  const rawBlob = row.audio_blob;
  const audioBuffer =
    rawBlob instanceof Uint8Array
      ? Buffer.from(rawBlob.buffer, rawBlob.byteOffset, rawBlob.byteLength)
      : Buffer.isBuffer(rawBlob)
      ? rawBlob
      : null;

  if (!audioBuffer || audioBuffer.length === 0) return null;

  const sp = row.script_provider;
  const scriptProvider: StoredLessonAudio['scriptProvider'] =
    sp === 'deepseek' || sp === 'gemini' ? sp : 'curated';

  const lt = row.lesson_type;
  const lessonType: AudioLessonType =
    lt === 'service' || lt === 'lab' || lt === 'flashcard' || lt === 'coach'
      ? lt
      : 'service';

  return {
    cacheKey: row.cache_key,
    lessonType,
    lessonId: String(row.lesson_id || ''),
    title: String(row.title || ''),
    voiceKey: String(row.voice_key || 'rachel'),
    voiceLabel: String(row.voice_label || 'Rachel'),
    scriptProvider,
    audioProvider: 'elevenlabs',
    scriptText: String(row.script_text || ''),
    mimeType: String(row.mime_type || 'audio/mpeg'),
    audioBuffer,
    byteLength: Number(row.byte_length || audioBuffer.length),
    playCount: Number(row.play_count || 1),
    createdAt: String(row.created_at || ''),
    lastPlayedAt: String(row.last_played_at || ''),
  };
}

export function getCachedAudioByKey(cacheKey: string): StoredLessonAudio | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT cache_key, lesson_type, lesson_id, title, voice_key, voice_label,
              script_provider, audio_provider, script_text, mime_type, audio_blob,
              byte_length, play_count, created_at, last_played_at
       FROM lesson_audio_cache
       WHERE cache_key = ?
       LIMIT 1`
    )
    .get(cacheKey) as Record<string, unknown> | undefined;

  return row ? mapRowToStoredAudio(row) : null;
}

export function findCachedAudioByLesson(
  lessonType: AudioLessonType,
  lessonId: string,
  voiceKey: string
): StoredLessonAudio | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT cache_key, lesson_type, lesson_id, title, voice_key, voice_label,
              script_provider, audio_provider, script_text, mime_type, audio_blob,
              byte_length, play_count, created_at, last_played_at
       FROM lesson_audio_cache
       WHERE lesson_type = ? AND lesson_id = ? AND voice_key = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(lessonType, lessonId, voiceKey) as Record<string, unknown> | undefined;

  return row ? mapRowToStoredAudio(row) : null;
}

function pruneCacheIfNeeded(db: DatabaseSync): void {
  const stats = db
    .prepare(
      `SELECT COUNT(*) AS row_count, COALESCE(SUM(byte_length), 0) AS total_bytes
       FROM lesson_audio_cache`
    )
    .get() as { row_count?: number; total_bytes?: number } | undefined;

  const rowCount = Number(stats?.row_count || 0);
  const totalBytes = Number(stats?.total_bytes || 0);

  if (rowCount <= MAX_CACHE_ROWS && totalBytes <= MAX_CACHE_BYTES) {
    return;
  }

  db.prepare(
    `DELETE FROM lesson_audio_cache
     WHERE cache_key IN (
       SELECT cache_key FROM lesson_audio_cache
       ORDER BY last_played_at ASC
       LIMIT ?
     )`
  ).run(Math.max(10, Math.floor(rowCount * 0.15)));
}

export function saveLessonAudio(entry: {
  cacheKey: string;
  lessonType: AudioLessonType;
  lessonId: string;
  title: string;
  voiceKey: string;
  voiceLabel: string;
  scriptProvider: 'deepseek' | 'gemini' | 'curated';
  scriptText: string;
  audioBuffer: Buffer;
  mimeType?: string;
}): StoredLessonAudio {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const mimeType = entry.mimeType || 'audio/mpeg';

  db.prepare(
    `INSERT INTO lesson_audio_cache (
       cache_key, lesson_type, lesson_id, title, voice_key, voice_label,
       script_provider, audio_provider, script_text, mime_type, audio_blob,
       byte_length, play_count, created_at, last_played_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'elevenlabs', ?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET
       title = excluded.title,
       voice_label = excluded.voice_label,
       script_provider = excluded.script_provider,
       script_text = excluded.script_text,
       mime_type = excluded.mime_type,
       audio_blob = excluded.audio_blob,
       byte_length = excluded.byte_length,
       last_played_at = excluded.last_played_at`
  ).run(
    entry.cacheKey,
    entry.lessonType,
    entry.lessonId,
    entry.title,
    entry.voiceKey,
    entry.voiceLabel,
    entry.scriptProvider,
    entry.scriptText,
    mimeType,
    entry.audioBuffer,
    entry.audioBuffer.length,
    nowIso,
    nowIso
  );

  pruneCacheIfNeeded(db);

  return {
    cacheKey: entry.cacheKey,
    lessonType: entry.lessonType,
    lessonId: entry.lessonId,
    title: entry.title,
    voiceKey: entry.voiceKey,
    voiceLabel: entry.voiceLabel,
    scriptProvider: entry.scriptProvider,
    audioProvider: 'elevenlabs',
    scriptText: entry.scriptText,
    mimeType,
    audioBuffer: entry.audioBuffer,
    byteLength: entry.audioBuffer.length,
    playCount: 1,
    createdAt: nowIso,
    lastPlayedAt: nowIso,
  };
}

export function touchAudioPlayed(cacheKey: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE lesson_audio_cache
     SET play_count = play_count + 1,
         last_played_at = ?
     WHERE cache_key = ?`
  ).run(new Date().toISOString(), cacheKey);
}

export function listSavedAudioItems(limitCount = 200): SavedAudioSummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT cache_key, lesson_type, lesson_id, title, voice_key, voice_label,
              script_provider, byte_length, play_count, created_at
       FROM lesson_audio_cache
       ORDER BY last_played_at DESC
       LIMIT ?`
    )
    .all(limitCount) as Record<string, unknown>[];

  return rows.map((row) => ({
    cacheKey: String(row.cache_key || ''),
    lessonType: (row.lesson_type as AudioLessonType) || 'service',
    lessonId: String(row.lesson_id || ''),
    title: String(row.title || ''),
    voiceKey: String(row.voice_key || 'rachel'),
    voiceLabel: String(row.voice_label || 'Rachel'),
    scriptProvider: String(row.script_provider || 'curated'),
    byteLength: Number(row.byte_length || 0),
    playCount: Number(row.play_count || 1),
    createdAt: String(row.created_at || ''),
  }));
}

export function getAudioStorageStats(): { savedCount: number; totalBytes: number } {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS saved_count, COALESCE(SUM(byte_length), 0) AS total_bytes
       FROM lesson_audio_cache`
    )
    .get() as { saved_count?: number; total_bytes?: number } | undefined;

  return {
    savedCount: Number(row?.saved_count || 0),
    totalBytes: Number(row?.total_bytes || 0),
  };
}
