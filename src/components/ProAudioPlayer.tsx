import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Database,
  FileText,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Square,
  Volume2,
} from 'lucide-react';
import { triggerSelectionHaptic } from '../utils/haptics';
import {
  AUDIO_SAVED_EVENT,
  AudioLessonType,
  AudioStatusResponse,
  AudioVoiceKey,
  fetchAudioStatus,
  fetchSavedAudioSet,
  getPreferredVoice,
  ProLessonAudioResponse,
  requestProLessonAudio,
  setPreferredVoice,
} from '../utils/proAudioClient';

export interface FirestoreSavedAudioRef {
  audioUrl: string;
  cacheKey: string;
  voiceKey: AudioVoiceKey;
  voiceLabel: string;
  scriptText: string;
  scriptProvider: 'deepseek' | 'gemini' | 'curated';
  byteLength: number;
}

interface ProAudioPlayerProps {
  lessonType: AudioLessonType;
  lessonId: string;
  title: string;
  summary: string;
  facts?: string[];
  examTip?: string;
  compact?: boolean;
  autoSynthesize?: boolean;
  savedFirestoreRecord?: FirestoreSavedAudioRef | null;
  onAudioSynthesized?: (result: ProLessonAudioResponse) => void;
}

const SPEED_OPTIONS = [1, 1.25, 1.5] as const;

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return `${mins}:${rem.toString().padStart(2, '0')}`;
}

export function ProAudioPlayer({
  lessonType,
  lessonId,
  title,
  summary,
  facts = [],
  examTip,
  compact = false,
  autoSynthesize = false,
  savedFirestoreRecord = null,
  onAudioSynthesized,
}: ProAudioPlayerProps) {
  const [statusInfo, setStatusInfo] = useState<AudioStatusResponse | null>(null);
  const [isSavedInSql, setIsSavedInSql] = useState<boolean>(false);
  const [voiceKey, setVoiceKey] = useState<AudioVoiceKey>(getPreferredVoice);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [track, setTrack] = useState<ProLessonAudioResponse | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isSpeechPlaying, setIsSpeechPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [showTranscript, setShowTranscript] = useState<boolean>(false);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoTriggeredKeyRef = useRef<string | null>(null);
  const onAudioSynthesizedRef = useRef(onAudioSynthesized);
  onAudioSynthesizedRef.current = onAudioSynthesized;

  const stopAllPlayback = useCallback(() => {
    if (audioElRef.current) {
      try {
        audioElRef.current.pause();
        audioElRef.current.removeAttribute('src');
        audioElRef.current.load();
      } catch {
        // Ignore audio cleanup quirks
      }
      audioElRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore speech cancel quirks
      }
    }
    setIsPlaying(false);
    setIsSpeechPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  useEffect(() => {
    let mounted = true;
    void fetchAudioStatus().then((info) => {
      if (mounted) setStatusInfo(info);
    });
    const refreshSaved = () => {
      void fetchSavedAudioSet().then((saved) => {
        if (mounted) setIsSavedInSql(saved.has(`${lessonType}:${lessonId}`));
      });
    };
    refreshSaved();
    window.addEventListener(AUDIO_SAVED_EVENT, refreshSaved);
    return () => {
      mounted = false;
      window.removeEventListener(AUDIO_SAVED_EVENT, refreshSaved);
    };
  }, [lessonType, lessonId]);

  // Reset track & stop audio cleanly whenever lesson changes or unmounts
  useEffect(() => {
    abortRef.current?.abort();
    stopAllPlayback();
    setTrack(null);
    setErrorMsg(null);
    setShowTranscript(false);
    autoTriggeredKeyRef.current = null;
    return () => {
      abortRef.current?.abort();
      stopAllPlayback();
    };
  }, [lessonType, lessonId, stopAllPlayback]);

  useEffect(() => {
    if (audioElRef.current) {
      audioElRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Auto-hydrate from Firestore or trigger background ElevenLabs synthesis when opened
  useEffect(() => {
    if (!autoSynthesize) return;

    if (
      savedFirestoreRecord &&
      savedFirestoreRecord.audioUrl &&
      savedFirestoreRecord.voiceKey === voiceKey
    ) {
      setTrack({
        audioMode: 'elevenlabs',
        cachedInSql: true,
        needsElevenLabsKey: false,
        cacheKey: savedFirestoreRecord.cacheKey,
        audioUrl: savedFirestoreRecord.audioUrl,
        scriptText: savedFirestoreRecord.scriptText,
        scriptProvider: savedFirestoreRecord.scriptProvider,
        audioProvider: 'elevenlabs',
        voiceKey: savedFirestoreRecord.voiceKey,
        voiceLabel: savedFirestoreRecord.voiceLabel,
        byteLength: savedFirestoreRecord.byteLength,
      });
      return;
    }

    const requestKey = `${lessonType}:${lessonId}:${voiceKey}`;
    if (autoTriggeredKeyRef.current === requestKey) return;
    autoTriggeredKeyRef.current = requestKey;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setErrorMsg(null);

    void requestProLessonAudio({
      lessonType,
      lessonId,
      voiceKey,
      title,
      summary,
      facts,
      examTip,
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        setTrack(result);
        if (result.cachedInSql) {
          setIsSavedInSql(true);
        }
        onAudioSynthesizedRef.current?.(result);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Keep auto-synthesis unobtrusive; user can still click Listen to retry
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
  }, [
    autoSynthesize,
    lessonType,
    lessonId,
    voiceKey,
    title,
    summary,
    facts,
    examTip,
    savedFirestoreRecord,
  ]);

  const startHtmlAudio = useCallback(
    (audioUrl: string, rate: number, canRetryOnStreamMiss = true) => {
      stopAllPlayback();
      const audio = new Audio(audioUrl);
      audio.preload = 'auto';
      audio.playbackRate = rate;

      audio.onloadedmetadata = () => {
        if (Number.isFinite(audio.duration)) {
          setDuration(audio.duration);
        }
      };
      audio.ontimeupdate = () => {
        setCurrentTime(audio.currentTime || 0);
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          setDuration(audio.duration);
        }
      };
      audio.onplay = () => setIsPlaying(true);
      audio.onpause = () => setIsPlaying(false);
      audio.onended = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };
      audio.onerror = () => {
        setIsPlaying(false);
        if (canRetryOnStreamMiss) {
          // If a Firestore-saved URL points to an evicted local cache entry, re-synthesize once cleanly
          setLoading(true);
          void requestProLessonAudio({
            lessonType,
            lessonId,
            voiceKey,
            title,
            summary,
            facts,
            examTip,
            forceRegenerate: true,
          })
            .then((fresh) => {
              setTrack(fresh);
              onAudioSynthesizedRef.current?.(fresh);
              if (fresh.audioMode === 'elevenlabs' && fresh.audioUrl) {
                startHtmlAudio(fresh.audioUrl, rate, false);
              } else {
                setErrorMsg('Studio stream refreshed into browser voice fallback.');
              }
            })
            .catch(() => {
              setErrorMsg('Unable to play studio audio stream. Tap retry or view transcript.');
            })
            .finally(() => setLoading(false));
          return;
        }
        setErrorMsg('Unable to play studio audio stream. Tap retry or view transcript.');
      };

      audioElRef.current = audio;
      void audio.play().catch(() => {
        setIsPlaying(false);
      });
    },
    [stopAllPlayback, lessonType, lessonId, voiceKey, title, summary, facts, examTip]
  );

  const startBrowserSpeech = useCallback(
    (scriptText: string, rate: number) => {
      stopAllPlayback();
      if (
        typeof window === 'undefined' ||
        !('speechSynthesis' in window) ||
        typeof SpeechSynthesisUtterance === 'undefined'
      ) {
        setErrorMsg('Audio playback is unavailable in this browser. Read the transcript below.');
        setShowTranscript(true);
        return;
      }
      try {
        const utterance = new SpeechSynthesisUtterance(scriptText);
        utterance.rate = rate;
        utterance.onend = () => setIsSpeechPlaying(false);
        utterance.onerror = () => setIsSpeechPlaying(false);
        setIsSpeechPlaying(true);
        window.speechSynthesis.speak(utterance);
      } catch {
        setIsSpeechPlaying(false);
      }
    },
    [stopAllPlayback]
  );

  const loadAndPlay = useCallback(
    async (overrideVoice?: AudioVoiceKey, forceRegenerate = false) => {
      const targetVoice = overrideVoice || voiceKey;
      triggerSelectionHaptic();
      setErrorMsg(null);
      setLoading(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = await requestProLessonAudio({
          lessonType,
          lessonId,
          voiceKey: targetVoice,
          title,
          summary,
          facts,
          examTip,
          forceRegenerate,
          signal: controller.signal,
        });

        setTrack(result);
        if (result.cachedInSql) {
          setIsSavedInSql(true);
        }
        onAudioSynthesizedRef.current?.(result);

        if (result.audioMode === 'elevenlabs' && result.audioUrl) {
          startHtmlAudio(result.audioUrl, playbackRate);
        } else {
          startBrowserSpeech(result.scriptText, playbackRate);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setErrorMsg(
          err instanceof Error ? err.message : 'Unable to prepare lesson audio right now.'
        );
      } finally {
        setLoading(false);
      }
    },
    [
      voiceKey,
      lessonType,
      lessonId,
      title,
      summary,
      facts,
      examTip,
      playbackRate,
      startHtmlAudio,
      startBrowserSpeech,
    ]
  );

  const handleTogglePlay = () => {
    triggerSelectionHaptic();
    if (loading) return;

    if (audioElRef.current) {
      if (isPlaying) {
        audioElRef.current.pause();
      } else {
        void audioElRef.current.play().catch(() => {});
      }
      return;
    }

    if (isSpeechPlaying) {
      stopAllPlayback();
      return;
    }

    if (track?.audioMode === 'elevenlabs' && track.audioUrl) {
      startHtmlAudio(track.audioUrl, playbackRate);
      return;
    }

    if (track?.audioMode === 'browser-fallback' && track.scriptText) {
      startBrowserSpeech(track.scriptText, playbackRate);
      return;
    }

    void loadAndPlay();
  };

  const handleCycleSpeed = () => {
    triggerSelectionHaptic();
    const idx = SPEED_OPTIONS.indexOf(playbackRate as (typeof SPEED_OPTIONS)[number]);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    setPlaybackRate(next);
  };

  const handleVoiceChange = (nextVoice: AudioVoiceKey) => {
    setVoiceKey(nextVoice);
    setPreferredVoice(nextVoice);
    if (track) {
      void loadAndPlay(nextVoice);
    }
  };

  const handleSeek = (nextSec: number) => {
    if (!audioElRef.current) return;
    audioElRef.current.currentTime = nextSec;
    setCurrentTime(nextSec);
  };

  const voices = statusInfo?.voices || [
    { key: 'rachel', label: 'Rachel', role: 'Clear Instructor' },
    { key: 'adam', label: 'Adam', role: 'Deep Narrator' },
    { key: 'bella', label: 'Bella', role: 'Upbeat Coach' },
    { key: 'josh', label: 'Josh', role: 'Exam Briefing' },
  ];

  const isFirestoreBacked = Boolean(
    savedFirestoreRecord && savedFirestoreRecord.voiceKey === voiceKey && savedFirestoreRecord.audioUrl
  );

  const activeProviderLabel =
    track?.audioMode === 'elevenlabs'
      ? `ElevenLabs · ${track.voiceLabel} · ${isFirestoreBacked ? 'Saved in Firestore & SQL' : 'Saved in SQL'}`
      : track?.audioMode === 'browser-fallback'
      ? 'Browser Voice Fallback'
      : isFirestoreBacked
      ? 'Studio Audio Saved in Firestore'
      : isSavedInSql
      ? 'Studio Audio Saved in SQL'
      : statusInfo?.elevenLabsConfigured
      ? 'ElevenLabs Studio Audio'
      : 'Pro Lesson Audio';

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-slate-50/90 ${
        compact ? 'p-3 space-y-2.5' : 'p-3.5 sm:p-4 space-y-3'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={handleTogglePlay}
            disabled={loading}
            aria-label={
              loading
                ? 'Synthesizing studio audio lesson'
                : isPlaying || isSpeechPlaying
                ? 'Pause lesson audio'
                : 'Listen to pro audio lesson'
            }
            className="inline-flex items-center justify-center gap-2 px-3.5 min-h-[44px] text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                {autoSynthesize ? 'Synthesizing...' : 'Generating Audio...'}
              </>
            ) : isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                Pause
              </>
            ) : isSpeechPlaying ? (
              <>
                <Square className="w-3.5 h-3.5" aria-hidden="true" />
                Stop Voice
              </>
            ) : (
              <>
                {track ? (
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                )}
                {!track
                  ? 'Listen to Audio Lesson'
                  : currentTime > 0
                  ? 'Resume Audio'
                  : 'Play Audio Lesson'}
              </>
            )}
          </button>

          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate flex items-center gap-1.5">
              {(isSavedInSql || isFirestoreBacked || track?.cachedInSql) && (
                <Database className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">{activeProviderLabel}</span>
            </p>
            <p className="text-[11px] text-slate-500 truncate">
              {track?.scriptProvider === 'deepseek'
                ? 'DeepSeek lesson script'
                : track?.scriptProvider === 'gemini'
                ? 'AI-briefed narration'
                : statusInfo?.deepSeekConfigured
                ? 'DeepSeek script + ElevenLabs voice'
                : 'Concise CLF-C02 spoken briefing'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <select
            aria-label="Select studio narrator voice"
            value={voiceKey}
            onChange={(e) => handleVoiceChange(e.target.value as AudioVoiceKey)}
            className="min-h-[44px] px-2.5 text-base sm:text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-[#C2410C] cursor-pointer"
          >
            {voices.map((v) => (
              <option key={v.key} value={v.key}>
                {v.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleCycleSpeed}
            aria-label={`Playback speed ${playbackRate}x`}
            className="min-w-[44px] min-h-[44px] px-2.5 text-xs font-mono font-semibold tabular-nums bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg cursor-pointer"
          >
            {playbackRate}x
          </button>

          {track && (
            <button
              type="button"
              onClick={() => setShowTranscript((s) => !s)}
              aria-expanded={showTranscript}
              aria-label={showTranscript ? 'Hide transcript' : 'Show transcript'}
              className="inline-flex items-center gap-1 min-h-[44px] px-2.5 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg cursor-pointer whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Script</span>
              {showTranscript ? (
                <ChevronUp className="w-3 h-3" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3 h-3" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Scrubbing timeline when ElevenLabs MP3 is loaded */}
      {track?.audioMode === 'elevenlabs' && track.audioUrl && (
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => startHtmlAudio(track.audioUrl!, playbackRate)}
            aria-label="Replay lesson from beginning"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <input
            type="range"
            aria-label="Audio playback progress"
            min={0}
            max={duration > 0 ? duration : 1}
            step={0.2}
            value={Math.min(currentTime, duration > 0 ? duration : 1)}
            onChange={(e) => handleSeek(Number(e.target.value))}
            className="flex-1 h-8 accent-[#C2410C] cursor-pointer"
          />
          <span className="text-[11px] font-mono tabular-nums text-slate-600 shrink-0">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      )}

      {track?.needsElevenLabsKey && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Playing browser voice fallback. Add <code className="font-mono">ELEVEN_LABS_API_KEY</code>{' '}
          in Settings &gt; Secrets to unlock ElevenLabs studio narration saved in SQL &amp; Firestore.
        </p>
      )}

      {track?.audioMode === 'browser-fallback' &&
        !track.needsElevenLabsKey &&
        track.upstreamMessage && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Playing browser voice fallback: {track.upstreamMessage}
          </p>
        )}

      {errorMsg && (
        <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {errorMsg}
        </p>
      )}

      {showTranscript && track?.scriptText && (
        <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 leading-relaxed">
          {track.scriptText}
        </div>
      )}
    </div>
  );
}
