import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  FileText,
  Loader2,
  Moon,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  SkipForward,
  Square,
  Volume2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ActiveAudioLesson, useAudioPlayer } from '../context/AudioPlayerContext';
import { getFriendlyFirestoreError } from '../lib/firebase';
import {
  saveServiceAudioToFirestore,
  ServiceAudioRecord,
  subscribeToServiceAudioDoc,
} from '../utils/cloudSync';
import { triggerSelectionHaptic } from '../utils/haptics';
import { isOfflineCacheSupported } from '../utils/offlineAudioCache';
import {
  AudioVoiceKey,
  ProLessonAudioResponse,
  requestProLessonAudio,
} from '../utils/proAudioClient';

export interface LessonAudioPlayerProps {
  /** Service identifier matching Firestore doc /users/{uid}/serviceAudio/{serviceId} */
  serviceId: string;
  /** Human-readable service title for display and synthesis context */
  title?: string;
  /** Optional AWS domain title shown on lock screen / MediaSession metadata */
  domainTitle?: string;
  /** Optional lesson summary used when synthesizing missing audio on demand or automatically */
  summary?: string;
  /** Optional exam facts included when synthesizing spoken script */
  facts?: string[];
  /** Optional exam tip appended when synthesizing spoken script */
  examTip?: string;
  /** Compact padding variant for tighter layouts */
  compact?: boolean;
  /** Automatically trigger synthesis + Firestore save when no stored track exists for the opened service */
  autoSynthesize?: boolean;
  /** Whether this lesson participates in the Service Guide playlist series */
  isSeriesLesson?: boolean;
  /** Identifier of the next lesson in the series */
  nextServiceId?: string;
  /** Title of the next lesson in the series (displayed when Auto-Play is enabled) */
  nextLessonTitle?: string;
  /** Identifier of the previous lesson in the series */
  prevServiceId?: string;
  /** Invoked when the user switches lessons locally */
  onNextLesson?: () => void;
  /** Whether to render the Auto-Play toggle (defaults to true) */
  showAutoPlay?: boolean;
  /** Called when audio is loaded from Firestore or newly synthesized */
  onAudioReady?: (record: ServiceAudioRecord) => void;
  /** Called after synthesis completes */
  onAudioSynthesized?: (result: ProLessonAudioResponse) => void;
  className?: string;
}

const DEFAULT_VOICES = [
  { key: 'rachel' as const, label: 'Rachel', role: 'Clear Instructor' },
  { key: 'adam' as const, label: 'Adam', role: 'Deep Narrator' },
  { key: 'bella' as const, label: 'Bella', role: 'Upbeat Coach' },
  { key: 'josh' as const, label: 'Josh', role: 'Exam Briefing' },
];

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatSleepCountdown(seconds: number): string {
  const mins = Math.ceil(seconds / 60);
  return `${mins}m`;
}

function splitScriptSentences(scriptText: string): string[] {
  const trimmed = scriptText.trim();
  if (!trimmed) return [];
  const parts = trimmed.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
  return parts ? parts.map((s) => s.trim()).filter(Boolean) : [trimmed];
}

function toAudioTrack(record: ServiceAudioRecord): ProLessonAudioResponse {
  return {
    audioMode: 'elevenlabs',
    cachedInSql: true,
    needsElevenLabsKey: false,
    cacheKey: record.cacheKey,
    audioUrl: record.audioUrl,
    scriptText: record.scriptText,
    scriptProvider: record.scriptProvider,
    audioProvider: 'elevenlabs',
    voiceKey: record.voiceKey,
    voiceLabel: record.voiceLabel,
    byteLength: record.byteLength,
  };
}

export function LessonAudioPlayer({
  serviceId,
  title,
  domainTitle,
  summary,
  facts = [],
  examTip,
  compact = false,
  autoSynthesize = false,
  isSeriesLesson = false,
  nextServiceId,
  nextLessonTitle,
  prevServiceId,
  showAutoPlay = true,
  onAudioReady,
  onAudioSynthesized,
  className = '',
}: LessonAudioPlayerProps) {
  const { user, isAuthReady } = useAuth();
  const displayTitle = title || serviceId;
  const audioCtx = useAudioPlayer();

  const [fetchedServiceKey, setFetchedServiceKey] = useState<string | null>(null);
  const [firestoreRecord, setFirestoreRecord] = useState<ServiceAudioRecord | null>(null);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [localTrack, setLocalTrack] = useState<ProLessonAudioResponse | null>(null);
  const [localSynthesizing, setLocalSynthesizing] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState<boolean>(false);

  const bgAbortRef = useRef<AbortController | null>(null);
  const autoTriggeredKeyRef = useRef<string | null>(null);
  const userChoseVoiceRef = useRef<boolean>(false);
  const isSeekingRef = useRef<boolean>(false);

  const onAudioReadyRef = useRef(onAudioReady);
  onAudioReadyRef.current = onAudioReady;
  const onAudioSynthesizedRef = useRef(onAudioSynthesized);
  onAudioSynthesizedRef.current = onAudioSynthesized;

  const lessonInput: ActiveAudioLesson = useMemo(
    () => ({
      serviceId,
      title: displayTitle,
      summary: summary?.trim() || '',
      facts,
      examTip,
      domainTitle,
      isSeriesLesson,
      nextServiceId,
      nextLessonTitle,
      prevServiceId,
    }),
    [
      serviceId,
      displayTitle,
      summary,
      facts,
      examTip,
      domainTitle,
      isSeriesLesson,
      nextServiceId,
      nextLessonTitle,
      prevServiceId,
    ]
  );

  const expectedFetchKey =
    isAuthReady && user && user.emailVerified ? `${user.uid}:${serviceId}` : null;
  const isFetchingFirestore =
    !isAuthReady || (expectedFetchKey !== null && fetchedServiceKey !== expectedFetchKey);

  const isThisLessonActive = audioCtx.activeLesson?.serviceId === serviceId;
  const isOtherAudioPlaying =
    !isThisLessonActive && (audioCtx.isPlaying || audioCtx.isSpeechPlaying);

  // Register this inline player as visible owner when active in viewport
  useEffect(() => {
    audioCtx.setInlineOwnerServiceId(serviceId);
    return () => {
      audioCtx.setInlineOwnerServiceId(null);
    };
  }, [serviceId, audioCtx.setInlineOwnerServiceId]);

  // Reset local view state cleanly when switching target service
  useEffect(() => {
    bgAbortRef.current?.abort();
    setLocalTrack(null);
    setLocalSynthesizing(false);
    setLocalError(null);
    setFirestoreRecord(null);
    setFirestoreError(null);
    setShowTranscript(false);
    autoTriggeredKeyRef.current = null;
    userChoseVoiceRef.current = false;

    return () => {
      bgAbortRef.current?.abort();
    };
  }, [serviceId]);

  // Fetch & subscribe to synthesized audio URL in Firestore for the active service
  useEffect(() => {
    if (!isAuthReady) return;

    if (!user || !user.emailVerified || !expectedFetchKey) {
      setFirestoreRecord(null);
      setFirestoreError(null);
      return;
    }

    setFirestoreError(null);
    const activeKey = expectedFetchKey;

    const unsubscribe = subscribeToServiceAudioDoc(
      user.uid,
      serviceId,
      (record) => {
        setFetchedServiceKey(activeKey);
        setFirestoreRecord(record);
        if (record) {
          onAudioReadyRef.current?.(record);
          if (!userChoseVoiceRef.current || record.voiceKey === audioCtx.voiceKey) {
            setLocalTrack(toAudioTrack(record));
            setLocalError(null);
            if (!isOtherAudioPlaying && !isThisLessonActive) {
              audioCtx.hydrateTrackFromFirestore(lessonInput, record);
            }
          }
        }
      },
      (err) => {
        setFetchedServiceKey(activeKey);
        setFirestoreError(getFriendlyFirestoreError(err));
      }
    );

    return () => {
      unsubscribe();
    };
  }, [
    isAuthReady,
    user,
    serviceId,
    expectedFetchKey,
    audioCtx.voiceKey,
    audioCtx.hydrateTrackFromFirestore,
    isOtherAudioPlaying,
    isThisLessonActive,
    lessonInput,
  ]);

  const persistLocalResult = useCallback(
    (result: ProLessonAudioResponse) => {
      onAudioSynthesizedRef.current?.(result);
      if (result.audioMode !== 'elevenlabs' || !result.audioUrl || !result.cacheKey) {
        return;
      }
      const record: ServiceAudioRecord = {
        serviceId,
        title: displayTitle,
        audioUrl: result.audioUrl,
        cacheKey: result.cacheKey,
        voiceKey: result.voiceKey,
        voiceLabel: result.voiceLabel,
        scriptText: result.scriptText,
        scriptProvider: result.scriptProvider,
        audioProvider: 'elevenlabs',
        byteLength: result.byteLength,
      };
      setFirestoreRecord(record);
      onAudioReadyRef.current?.(record);
      if (user && user.emailVerified) {
        void saveServiceAudioToFirestore(user.uid, record).catch((err) => {
          setFirestoreError(getFriendlyFirestoreError(err));
        });
      }
    },
    [serviceId, displayTitle, user]
  );

  // Auto-synthesize quietly in background when opened without a Firestore record
  useEffect(() => {
    if (!autoSynthesize || isFetchingFirestore || !summary?.trim()) return;

    if (
      firestoreRecord &&
      firestoreRecord.audioUrl &&
      (!userChoseVoiceRef.current || firestoreRecord.voiceKey === audioCtx.voiceKey)
    ) {
      return;
    }

    const triggerKey = `${serviceId}:${audioCtx.voiceKey}`;
    if (autoTriggeredKeyRef.current === triggerKey) return;
    autoTriggeredKeyRef.current = triggerKey;

    if (!isOtherAudioPlaying) {
      void audioCtx.loadLessonTrack({
        lesson: lessonInput,
        voiceKey: audioCtx.voiceKey,
        autoPlay: false,
        onSynthesized: (res) => {
          setLocalTrack(res);
          onAudioSynthesizedRef.current?.(res);
        },
        onReadyRecord: (rec) => {
          setFirestoreRecord(rec);
          onAudioReadyRef.current?.(rec);
        },
      });
      return;
    }

    // Another service is actively playing globally: prepare this lesson quietly without interrupting it
    bgAbortRef.current?.abort();
    const controller = new AbortController();
    bgAbortRef.current = controller;
    setLocalSynthesizing(true);

    void requestProLessonAudio({
      lessonType: 'service',
      lessonId: serviceId,
      voiceKey: audioCtx.voiceKey,
      title: displayTitle,
      summary: summary.trim(),
      facts,
      examTip,
      signal: controller.signal,
    })
      .then((res) => {
        if (controller.signal.aborted) return;
        setLocalTrack(res);
        persistLocalResult(res);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setLocalError(
          err instanceof Error ? err.message : 'Unable to prepare studio lesson audio.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLocalSynthesizing(false);
        }
      });
  }, [
    autoSynthesize,
    isFetchingFirestore,
    summary,
    firestoreRecord,
    serviceId,
    displayTitle,
    facts,
    examTip,
    audioCtx.voiceKey,
    audioCtx.loadLessonTrack,
    isOtherAudioPlaying,
    lessonInput,
    persistLocalResult,
  ]);

  const effectiveTrack = isThisLessonActive
    ? audioCtx.activeTrack || localTrack
    : localTrack || (firestoreRecord ? toAudioTrack(firestoreRecord) : null);

  const isSynthesizing = isThisLessonActive
    ? audioCtx.isSynthesizing
    : localSynthesizing;
  const isPlaying = isThisLessonActive ? audioCtx.isPlaying : false;
  const isSpeechPlaying = isThisLessonActive ? audioCtx.isSpeechPlaying : false;
  const isBuffering = isThisLessonActive ? audioCtx.isBuffering : false;
  const currentTime = isThisLessonActive ? audioCtx.currentTime : 0;
  const duration = isThisLessonActive ? audioCtx.duration : 0;
  const activeError = isThisLessonActive
    ? audioCtx.playbackError || firestoreError || localError
    : firestoreError || localError;

  const activeAudioUrl =
    effectiveTrack?.audioMode === 'elevenlabs' ? effectiveTrack.audioUrl : null;
  const hasAudioStream = Boolean(activeAudioUrl);
  const isBusy = isFetchingFirestore || isSynthesizing;
  const isFirestoreStored = Boolean(firestoreRecord && firestoreRecord.audioUrl);

  const handleTogglePlay = () => {
    triggerSelectionHaptic();
    if (isBusy) return;

    if (isThisLessonActive) {
      audioCtx.togglePlayPause();
      return;
    }

    if (effectiveTrack) {
      void audioCtx.loadLessonTrack({
        lesson: lessonInput,
        track: effectiveTrack,
        autoPlay: true,
      });
      return;
    }

    void audioCtx.loadLessonTrack({
      lesson: lessonInput,
      voiceKey: audioCtx.voiceKey,
      autoPlay: true,
      onSynthesized: (res) => {
        setLocalTrack(res);
        onAudioSynthesizedRef.current?.(res);
      },
      onReadyRecord: (rec) => {
        setFirestoreRecord(rec);
        onAudioReadyRef.current?.(rec);
      },
    });
  };

  const handleVoiceChange = (nextVoice: AudioVoiceKey) => {
    triggerSelectionHaptic();
    userChoseVoiceRef.current = true;
    audioCtx.setVoicePreference(nextVoice);

    if (firestoreRecord && firestoreRecord.voiceKey === nextVoice) {
      const recTrack = toAudioTrack(firestoreRecord);
      setLocalTrack(recTrack);
      if (isThisLessonActive || !isOtherAudioPlaying) {
        void audioCtx.loadLessonTrack({
          lesson: lessonInput,
          track: recTrack,
          voiceKey: nextVoice,
          autoPlay: isPlaying || isSpeechPlaying,
        });
      }
      return;
    }

    if (summary?.trim()) {
      void audioCtx.loadLessonTrack({
        lesson: lessonInput,
        voiceKey: nextVoice,
        autoPlay: isPlaying || isSpeechPlaying,
        onSynthesized: (res) => {
          setLocalTrack(res);
          onAudioSynthesizedRef.current?.(res);
        },
        onReadyRecord: (rec) => {
          setFirestoreRecord(rec);
          onAudioReadyRef.current?.(rec);
        },
      });
    }
  };

  const handleRetrySynthesis = () => {
    triggerSelectionHaptic();
    void audioCtx.loadLessonTrack({
      lesson: lessonInput,
      voiceKey: audioCtx.voiceKey,
      forceRegenerate: true,
      autoPlay: true,
      onSynthesized: (res) => {
        setLocalTrack(res);
        onAudioSynthesizedRef.current?.(res);
      },
      onReadyRecord: (rec) => {
        setFirestoreRecord(rec);
        onAudioReadyRef.current?.(rec);
      },
    });
  };

  const scriptSentences = useMemo(
    () => (effectiveTrack?.scriptText ? splitScriptSentences(effectiveTrack.scriptText) : []),
    [effectiveTrack?.scriptText]
  );

  // Estimate active sentence index from audio progress for synchronized transcript follow-along
  const activeSentenceIdx = useMemo(() => {
    if (scriptSentences.length <= 1 || duration <= 0 || currentTime <= 0) return -1;
    const totalChars = scriptSentences.reduce((sum, s) => sum + s.length, 0);
    if (totalChars <= 0) return -1;
    const targetChar = (currentTime / duration) * totalChars;
    let running = 0;
    for (let i = 0; i < scriptSentences.length; i += 1) {
      running += scriptSentences[i].length;
      if (targetChar <= running) return i;
    }
    return scriptSentences.length - 1;
  }, [scriptSentences, currentTime, duration]);

  const voices = audioCtx.statusInfo?.voices || DEFAULT_VOICES;

  const primaryLabel = isFetchingFirestore
    ? 'Loading Audio...'
    : isSynthesizing
    ? 'Synthesizing...'
    : isBuffering && isPlaying
    ? 'Buffering...'
    : isPlaying
    ? 'Pause'
    : isSpeechPlaying
    ? 'Stop Voice'
    : effectiveTrack
    ? currentTime > 0.5
      ? 'Resume Audio'
      : 'Play Audio Lesson'
    : 'Listen to Audio Lesson';

  const statusHeadline = isFetchingFirestore
    ? 'Fetching audio from Cloud Firestore'
    : isFirestoreStored
    ? `ElevenLabs · ${effectiveTrack?.voiceLabel || firestoreRecord?.voiceLabel} · Stored in Firestore`
    : effectiveTrack?.audioMode === 'elevenlabs'
    ? `ElevenLabs · ${effectiveTrack.voiceLabel} · Ready to Play`
    : effectiveTrack?.audioMode === 'browser-fallback'
    ? 'Browser Voice Fallback'
    : 'ElevenLabs Studio Audio';

  const statusSubtitle = isFetchingFirestore
    ? `Checking saved narration for ${displayTitle}`
    : isSynthesizing
    ? 'Generating narration script and studio MP3'
    : isThisLessonActive && audioCtx.isOfflineCached
    ? 'Saved offline · Instant playback'
    : effectiveTrack?.scriptProvider === 'deepseek'
    ? 'DeepSeek script · Synced audio'
    : effectiveTrack?.scriptProvider === 'gemini'
    ? 'AI-briefed narration'
    : !user
    ? 'Sign in with Google to save audio to Firestore'
    : 'Concise CLF-C02 spoken briefing';

  const sleepLabel =
    audioCtx.sleepTimerMode === 'off'
      ? 'Sleep'
      : audioCtx.sleepTimerMode === 'end'
      ? 'End'
      : audioCtx.sleepRemainingSec !== null
      ? formatSleepCountdown(audioCtx.sleepRemainingSec)
      : `${audioCtx.sleepTimerMode}m`;

  const effectiveDuration = duration > 0 ? duration : 1;
  const clampedSeek = Math.min(currentTime, effectiveDuration);

  return (
    <section
      aria-label={`Lesson audio player for ${displayTitle}`}
      aria-busy={isBusy}
      className={`rounded-xl border border-slate-200 bg-slate-50/90 ${
        compact ? 'p-3.5 space-y-3' : 'p-4 space-y-3.5'
      } ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={handleTogglePlay}
            disabled={isBusy || (!hasAudioStream && !effectiveTrack?.scriptText && !summary?.trim())}
            aria-label={
              isBusy
                ? primaryLabel
                : isPlaying || isSpeechPlaying
                ? 'Pause lesson audio'
                : `Play lesson audio for ${displayTitle}`
            }
            className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C]"
          >
            {isBusy || (isBuffering && isPlaying) ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : isPlaying ? (
              <Pause className="w-3.5 h-3.5" aria-hidden="true" />
            ) : isSpeechPlaying ? (
              <Square className="w-3.5 h-3.5" aria-hidden="true" />
            ) : effectiveTrack ? (
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
            )}
            <span>{primaryLabel}</span>
          </button>

          {/* ±15s Audible-grade skip controls when active stream is loaded */}
          {isThisLessonActive && hasAudioStream && duration > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  triggerSelectionHaptic();
                  audioCtx.skipBy(-15);
                }}
                aria-label="Rewind 15 seconds"
                className="min-w-[44px] min-h-[44px] px-2 inline-flex items-center justify-center gap-0.5 text-[11px] font-mono font-semibold tabular-nums bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>15</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerSelectionHaptic();
                  audioCtx.skipBy(15);
                }}
                aria-label="Skip forward 15 seconds"
                className="min-w-[44px] min-h-[44px] px-2 inline-flex items-center justify-center gap-0.5 text-[11px] font-mono font-semibold tabular-nums bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg cursor-pointer whitespace-nowrap"
              >
                <span>15</span>
                <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate flex items-center gap-1.5">
              {isFirestoreStored && (
                <Database className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">{statusHeadline}</span>
            </p>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">{statusSubtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {showAutoPlay && (
            <button
              type="button"
              role="switch"
              aria-checked={audioCtx.autoPlayEnabled}
              onClick={() => {
                triggerSelectionHaptic();
                audioCtx.toggleAutoPlay();
              }}
              aria-label={
                nextLessonTitle
                  ? `Auto-Play next lesson: ${nextLessonTitle}`
                  : 'Auto-Play next lesson'
              }
              className={`inline-flex items-center gap-2 min-h-[44px] px-2.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C] ${
                audioCtx.autoPlayEnabled
                  ? 'bg-amber-50 border-[#C2410C]/40 text-[#C2410C]'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <SkipForward className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Auto-Play</span>
              <span
                aria-hidden="true"
                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                  audioCtx.autoPlayEnabled ? 'bg-[#C2410C]' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    audioCtx.autoPlayEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </button>
          )}

          <select
            aria-label="Select narrator voice"
            value={audioCtx.voiceKey}
            disabled={isBusy}
            onChange={(e) => handleVoiceChange(e.target.value as AudioVoiceKey)}
            className="min-h-[44px] px-2.5 text-base sm:text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-[#C2410C] cursor-pointer disabled:opacity-50"
          >
            {voices.map((v) => (
              <option key={v.key} value={v.key}>
                {v.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              triggerSelectionHaptic();
              audioCtx.cyclePlaybackRate();
            }}
            aria-label={`Playback speed ${audioCtx.playbackRate}x`}
            className="min-w-[44px] min-h-[44px] px-2.5 text-xs font-mono font-semibold tabular-nums bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
          >
            {audioCtx.playbackRate}x
          </button>

          <button
            type="button"
            onClick={() => {
              triggerSelectionHaptic();
              audioCtx.cycleSleepTimer();
            }}
            aria-label={`Sleep timer: ${
              audioCtx.sleepTimerMode === 'off'
                ? 'Off'
                : audioCtx.sleepTimerMode === 'end'
                ? 'End of lesson'
                : `${audioCtx.sleepTimerMode} minutes`
            }`}
            className={`inline-flex items-center gap-1 min-w-[44px] min-h-[44px] px-2.5 text-xs font-semibold rounded-lg border cursor-pointer whitespace-nowrap shrink-0 ${
              audioCtx.sleepTimerMode !== 'off'
                ? 'bg-slate-900 border-slate-900 text-white'
                : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
            }`}
          >
            <Moon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="font-mono tabular-nums">{sleepLabel}</span>
          </button>

          {isThisLessonActive && hasAudioStream && isOfflineCacheSupported() && (
            <button
              type="button"
              disabled={audioCtx.isSavingOffline}
              onClick={() => {
                triggerSelectionHaptic();
                void audioCtx.toggleOfflineSave();
              }}
              aria-label={
                audioCtx.isOfflineCached
                  ? 'Remove offline audio download'
                  : 'Save audio for offline listening'
              }
              className={`inline-flex items-center gap-1 min-w-[44px] min-h-[44px] px-2.5 text-xs font-semibold rounded-lg border cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 ${
                audioCtx.isOfflineCached
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                  : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
              }`}
            >
              {audioCtx.isSavingOffline ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : audioCtx.isOfflineCached ? (
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">
                {audioCtx.isOfflineCached ? 'Offline' : 'Save'}
              </span>
            </button>
          )}

          {effectiveTrack?.scriptText && (
            <button
              type="button"
              onClick={() => setShowTranscript((prev) => !prev)}
              aria-expanded={showTranscript}
              aria-label={showTranscript ? 'Hide lesson script' : 'Show lesson script'}
              className="inline-flex items-center gap-1 min-h-[44px] px-2.5 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
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

      {/* Loading skeleton shimmer while checking Firestore for the active service */}
      {isFetchingFirestore && (
        <div className="flex items-center gap-3 pt-0.5" role="status" aria-live="polite">
          <div className="h-2 flex-1 rounded-full bg-slate-200/80 animate-pulse" />
          <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
            0:00 / --:--
          </span>
        </div>
      )}

      {/* Seek & Progress Bar when this service's audio stream is active */}
      {!isFetchingFirestore && isThisLessonActive && hasAudioStream && (
        <div className="flex items-center gap-2.5 pt-0.5">
          <button
            type="button"
            onClick={() => {
              triggerSelectionHaptic();
              audioCtx.replayFromStart();
            }}
            aria-label="Restart lesson audio from beginning"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <input
            type="range"
            aria-label={`Seek audio timeline for ${displayTitle}`}
            min={0}
            max={effectiveDuration}
            step={0.1}
            disabled={duration <= 0}
            value={clampedSeek}
            onPointerDown={() => {
              isSeekingRef.current = true;
            }}
            onPointerUp={() => {
              isSeekingRef.current = false;
            }}
            onBlur={() => {
              isSeekingRef.current = false;
            }}
            onChange={(e) => audioCtx.seekTo(Number(e.target.value))}
            className="flex-1 h-8 accent-[#C2410C] cursor-pointer disabled:opacity-45"
          />
          <span className="text-[11px] font-mono tabular-nums text-slate-600 shrink-0">
            {formatDuration(currentTime)} / {duration > 0 ? formatDuration(duration) : '--:--'}
          </span>
        </div>
      )}

      {showAutoPlay && audioCtx.autoPlayEnabled && (
        <p className="text-[11px] text-slate-600 truncate">
          {nextLessonTitle
            ? `Auto-Play on · Prefetching & up next: ${nextLessonTitle}`
            : 'Auto-Play on · Final lesson in this series'}
        </p>
      )}

      {/* Empty state if standalone & signed-in without a Firestore track or synthesis summary */}
      {!isFetchingFirestore && !isSynthesizing && !hasAudioStream && !effectiveTrack && !summary?.trim() && (
        <p className="text-xs text-slate-600">
          No synthesized audio saved in Cloud Firestore for{' '}
          <span className="font-semibold">{displayTitle}</span> yet.
        </p>
      )}

      {effectiveTrack?.needsElevenLabsKey && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Playing browser voice fallback. Configure a valid{' '}
          <code className="font-mono">ELEVEN_LABS_API_KEY</code> in Settings &gt; Secrets to store
          studio MP3 narration in Firestore.
        </p>
      )}

      {effectiveTrack?.audioMode === 'browser-fallback' &&
        !effectiveTrack.needsElevenLabsKey &&
        effectiveTrack.upstreamMessage && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <span className="min-w-0">{effectiveTrack.upstreamMessage}</span>
            {summary?.trim() && (
              <button
                type="button"
                onClick={handleRetrySynthesis}
                className="inline-flex items-center gap-1 px-2.5 min-h-[36px] text-xs font-semibold bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 rounded-md shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" aria-hidden="true" />
                Retry
              </button>
            )}
          </div>
        )}

      {activeError && (
        <div className="flex items-center justify-between gap-2 text-xs text-rose-900 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{activeError}</span>
          </span>
          {summary?.trim() && (
            <button
              type="button"
              onClick={handleRetrySynthesis}
              className="inline-flex items-center gap-1 px-3 min-h-[44px] text-xs font-semibold bg-white border border-rose-200 hover:bg-rose-100 text-rose-900 rounded-md shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" />
              Retry
            </button>
          )}
        </div>
      )}

      {showTranscript && scriptSentences.length > 0 && (
        <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 leading-relaxed space-y-1">
          <p>
            {scriptSentences.map((sentence, idx) => {
              const isHighlighted = isThisLessonActive && idx === activeSentenceIdx;
              return (
                <span
                  key={`${idx}-${sentence.slice(0, 12)}`}
                  className={
                    isHighlighted
                      ? 'bg-amber-100/80 text-slate-950 font-medium rounded px-0.5 transition-colors'
                      : 'transition-colors'
                  }
                >
                  {sentence}{' '}
                </span>
              );
            })}
          </p>
        </div>
      )}
    </section>
  );
}
