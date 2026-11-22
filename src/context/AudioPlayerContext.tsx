import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AWS_SERVICES, EXAM_DOMAINS } from '../data/awsServices';
import { AwsService } from '../data/types';
import { useAuth } from './AuthContext';
import { getFriendlyFirestoreError } from '../lib/firebase';
import { saveServiceAudioToFirestore, ServiceAudioRecord } from '../utils/cloudSync';
import {
  isAudioCachedOffline,
  removeAudioOffline,
  resolvePlayableAudioUrl,
  saveAudioOffline,
} from '../utils/offlineAudioCache';
import {
  AudioStatusResponse,
  AudioVoiceKey,
  fetchAudioStatus,
  getPreferredVoice,
  ProLessonAudioResponse,
  requestProLessonAudio,
  setPreferredVoice,
} from '../utils/proAudioClient';

export const PLAYBACK_SPEED_OPTIONS = [0.85, 1, 1.25, 1.5, 1.75, 2] as const;
export type SleepTimerMode = 'off' | 'end' | 10 | 20;

const AUTOPLAY_PREF_KEY = 'cloudprep_audio_autoplay_v1';
const SPEED_PREF_KEY = 'cloudprep_audio_speed_v1';

export interface ActiveAudioLesson {
  serviceId: string;
  title: string;
  summary: string;
  facts: string[];
  examTip?: string;
  domainTitle?: string;
  isSeriesLesson?: boolean;
  nextServiceId?: string;
  nextLessonTitle?: string;
  prevServiceId?: string;
}

interface PlayLessonParams {
  lesson: ActiveAudioLesson;
  track?: ProLessonAudioResponse | null;
  voiceKey?: AudioVoiceKey;
  autoPlay?: boolean;
  forceRegenerate?: boolean;
  onSynthesized?: (result: ProLessonAudioResponse) => void;
  onReadyRecord?: (record: ServiceAudioRecord) => void;
}

export function buildLessonFromService(
  service: AwsService,
  seriesList: AwsService[] = AWS_SERVICES
): ActiveAudioLesson {
  const domain = EXAM_DOMAINS.find((d) => d.id === service.domain);
  const idx = seriesList.findIndex((s) => s.id === service.id);
  const nextSvc = idx >= 0 && idx < seriesList.length - 1 ? seriesList[idx + 1] : null;
  const prevSvc = idx > 0 ? seriesList[idx - 1] : null;

  return {
    serviceId: service.id,
    title: service.name,
    summary: `${service.oneLiner} ${service.description}`,
    facts: [...service.keyFeatures.slice(0, 2), ...service.examScenarios.slice(0, 2)],
    examTip: service.compareWith
      ? `Pricing: ${service.pricingModel}. Contrast: ${service.compareWith}`
      : `Pricing: ${service.pricingModel}`,
    domainTitle: domain ? `Domain ${domain.number}: ${domain.title}` : 'AWS Service Guide',
    isSeriesLesson: true,
    nextServiceId: nextSvc?.id,
    nextLessonTitle: nextSvc?.name,
    prevServiceId: prevSvc?.id,
  };
}

function getInitialAutoPlay(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(AUTOPLAY_PREF_KEY) === 'true';
  } catch {
    return false;
  }
}

function getInitialSpeed(): number {
  if (typeof window === 'undefined') return 1;
  try {
    const raw = Number(window.localStorage.getItem(SPEED_PREF_KEY));
    if (PLAYBACK_SPEED_OPTIONS.includes(raw as (typeof PLAYBACK_SPEED_OPTIONS)[number])) {
      return raw;
    }
  } catch {
    // Ignore storage error
  }
  return 1;
}

interface AudioPlayerContextValue {
  statusInfo: AudioStatusResponse | null;
  activeLesson: ActiveAudioLesson | null;
  activeTrack: ProLessonAudioResponse | null;
  voiceKey: AudioVoiceKey;
  playbackRate: number;
  autoPlayEnabled: boolean;
  sleepTimerMode: SleepTimerMode;
  sleepRemainingSec: number | null;
  isPlaying: boolean;
  isSpeechPlaying: boolean;
  isSynthesizing: boolean;
  isBuffering: boolean;
  isOfflineCached: boolean;
  isSavingOffline: boolean;
  currentTime: number;
  duration: number;
  playbackError: string | null;
  inlineOwnerServiceId: string | null;
  setInlineOwnerServiceId: (serviceId: string | null) => void;
  setVoicePreference: (voice: AudioVoiceKey) => void;
  cyclePlaybackRate: () => void;
  toggleAutoPlay: () => void;
  cycleSleepTimer: () => void;
  loadLessonTrack: (params: PlayLessonParams) => Promise<ProLessonAudioResponse | null>;
  hydrateTrackFromFirestore: (lesson: ActiveAudioLesson, record: ServiceAudioRecord) => void;
  togglePlayPause: () => void;
  pausePlayback: () => void;
  resumePlayback: () => void;
  stopAndDismiss: () => void;
  replayFromStart: () => void;
  seekTo: (seconds: number) => void;
  skipBy: (deltaSeconds: number) => void;
  playNextLesson: () => void;
  playPrevLesson: () => void;
  toggleOfflineSave: () => Promise<void>;
  subscribeAdvanceListener: (cb: (serviceId: string) => void) => () => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [statusInfo, setStatusInfo] = useState<AudioStatusResponse | null>(null);
  const [activeLesson, setActiveLesson] = useState<ActiveAudioLesson | null>(null);
  const [activeTrack, setActiveTrack] = useState<ProLessonAudioResponse | null>(null);
  const [voiceKey, setVoiceKey] = useState<AudioVoiceKey>(getPreferredVoice);
  const [playbackRate, setPlaybackRate] = useState<number>(getInitialSpeed);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState<boolean>(getInitialAutoPlay);
  const [sleepTimerMode, setSleepTimerMode] = useState<SleepTimerMode>('off');
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isSpeechPlaying, setIsSpeechPlaying] = useState<boolean>(false);
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [isOfflineCached, setIsOfflineCached] = useState<boolean>(false);
  const [isSavingOffline, setIsSavingOffline] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [inlineOwnerServiceId, setInlineOwnerServiceId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const synthAbortRef = useRef<AbortController | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const prefetchedLessonsRef = useRef<Map<string, ProLessonAudioResponse>>(new Map());
  const prefetchAttemptedRef = useRef<Set<string>>(new Set());
  const recoveredCacheKeyRef = useRef<string | null>(null);
  const wantsPlaybackOnRecoveryRef = useRef<boolean>(false);
  const duckedByVoiceRef = useRef<boolean>(false);
  const advanceListenersRef = useRef<Set<(serviceId: string) => void>>(new Set());

  const activeLessonRef = useRef(activeLesson);
  activeLessonRef.current = activeLesson;
  const activeTrackRef = useRef(activeTrack);
  activeTrackRef.current = activeTrack;
  const voiceKeyRef = useRef(voiceKey);
  voiceKeyRef.current = voiceKey;
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;
  const autoPlayEnabledRef = useRef(autoPlayEnabled);
  autoPlayEnabledRef.current = autoPlayEnabled;
  const sleepTimerModeRef = useRef(sleepTimerMode);
  sleepTimerModeRef.current = sleepTimerMode;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const isSpeechPlayingRef = useRef(isSpeechPlaying);
  isSpeechPlayingRef.current = isSpeechPlaying;
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    let mounted = true;
    void fetchAudioStatus().then((info) => {
      if (mounted) setStatusInfo(info);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      try {
        URL.revokeObjectURL(objectUrlRef.current);
      } catch {
        // Ignore revoke error
      }
      objectUrlRef.current = null;
    }
  }, []);

  const stopMediaElements = useCallback(() => {
    utteranceRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // Ignore reset error
      }
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore speech cancel error
      }
    }
    setIsPlaying(false);
    setIsSpeechPlaying(false);
    setIsBuffering(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const persistRecordToFirestore = useCallback(
    (lesson: ActiveAudioLesson, result: ProLessonAudioResponse) => {
      if (result.audioMode !== 'elevenlabs' || !result.audioUrl || !result.cacheKey) {
        return null;
      }
      const record: ServiceAudioRecord = {
        serviceId: lesson.serviceId,
        title: lesson.title,
        audioUrl: result.audioUrl,
        cacheKey: result.cacheKey,
        voiceKey: result.voiceKey,
        voiceLabel: result.voiceLabel,
        scriptText: result.scriptText,
        scriptProvider: result.scriptProvider,
        audioProvider: 'elevenlabs',
        byteLength: result.byteLength,
      };
      const currentUser = userRef.current;
      if (currentUser && currentUser.emailVerified) {
        void saveServiceAudioToFirestore(currentUser.uid, record).catch((err) => {
          setPlaybackError(getFriendlyFirestoreError(err));
        });
      }
      return record;
    },
    []
  );

  const attachAudioAndMaybePlay = useCallback(
    async (audioUrl: string, shouldPlay: boolean) => {
      const audio = audioRef.current;
      if (!audio) return;

      const resolved = await resolvePlayableAudioUrl(audioUrl);
      revokeObjectUrl();
      if (resolved.isObjectUrl) {
        objectUrlRef.current = resolved.src;
      }
      setIsOfflineCached(resolved.isOfflineCached);

      audio.src = resolved.src;
      audio.playbackRate = playbackRateRef.current;
      audio.load();

      if (shouldPlay) {
        wantsPlaybackOnRecoveryRef.current = true;
        try {
          await audio.play();
        } catch {
          setIsPlaying(false);
          wantsPlaybackOnRecoveryRef.current = false;
        }
      }
    },
    [revokeObjectUrl]
  );

  const startBrowserSpeech = useCallback(
    (scriptText: string, onEndCallback?: () => void) => {
      stopMediaElements();
      if (
        typeof window === 'undefined' ||
        !('speechSynthesis' in window) ||
        typeof SpeechSynthesisUtterance === 'undefined'
      ) {
        setPlaybackError('Audio playback is unavailable in this browser.');
        return;
      }
      try {
        const utterance = new SpeechSynthesisUtterance(scriptText);
        utteranceRef.current = utterance;
        utterance.rate = Math.min(2, Math.max(0.75, playbackRateRef.current));
        utterance.onend = () => {
          if (utteranceRef.current !== utterance) return;
          utteranceRef.current = null;
          setIsSpeechPlaying(false);
          onEndCallback?.();
        };
        utterance.onerror = () => {
          if (utteranceRef.current !== utterance) return;
          utteranceRef.current = null;
          setIsSpeechPlaying(false);
        };
        setIsSpeechPlaying(true);
        window.speechSynthesis.speak(utterance);
      } catch {
        utteranceRef.current = null;
        setIsSpeechPlaying(false);
      }
    },
    [stopMediaElements]
  );

  const loadLessonTrack = useCallback(
    async ({
      lesson,
      track: providedTrack,
      voiceKey: overrideVoice,
      autoPlay = false,
      forceRegenerate = false,
      onSynthesized,
      onReadyRecord,
    }: PlayLessonParams): Promise<ProLessonAudioResponse | null> => {
      const targetVoice = overrideVoice || voiceKeyRef.current;
      const cacheKey = `${lesson.serviceId}:${targetVoice}`;

      setActiveLesson(lesson);
      setPlaybackError(null);
      duckedByVoiceRef.current = false;

      if (providedTrack) {
        stopMediaElements();
        setActiveTrack(providedTrack);
        if (providedTrack.audioMode === 'elevenlabs' && providedTrack.audioUrl) {
          await attachAudioAndMaybePlay(providedTrack.audioUrl, autoPlay);
        } else if (autoPlay && providedTrack.scriptText) {
          startBrowserSpeech(providedTrack.scriptText);
        }
        return providedTrack;
      }

      if (!forceRegenerate) {
        const prefetched = prefetchedLessonsRef.current.get(cacheKey);
        if (prefetched) {
          stopMediaElements();
          setActiveTrack(prefetched);
          onSynthesized?.(prefetched);
          const record = persistRecordToFirestore(lesson, prefetched);
          if (record) onReadyRecord?.(record);
          if (prefetched.audioMode === 'elevenlabs' && prefetched.audioUrl) {
            await attachAudioAndMaybePlay(prefetched.audioUrl, autoPlay);
          } else if (autoPlay && prefetched.scriptText) {
            startBrowserSpeech(prefetched.scriptText);
          }
          return prefetched;
        }
      }

      if (!lesson.summary?.trim()) {
        setPlaybackError('No audio summary is available for this lesson yet.');
        return null;
      }

      synthAbortRef.current?.abort();
      const controller = new AbortController();
      synthAbortRef.current = controller;
      stopMediaElements();
      setIsSynthesizing(true);

      try {
        const result = await requestProLessonAudio({
          lessonType: 'service',
          lessonId: lesson.serviceId,
          voiceKey: targetVoice,
          title: lesson.title,
          summary: lesson.summary.trim(),
          facts: lesson.facts,
          examTip: lesson.examTip,
          forceRegenerate,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return null;

        prefetchedLessonsRef.current.set(cacheKey, result);
        setActiveTrack(result);
        onSynthesized?.(result);

        const record = persistRecordToFirestore(lesson, result);
        if (record) {
          onReadyRecord?.(record);
        }

        if (result.audioMode === 'elevenlabs' && result.audioUrl) {
          // Cache audio in browser Cache API quietly when played/generated so commutes work offline
          if (autoPlay) {
            void saveAudioOffline(result.audioUrl).then((ok) => {
              if (ok) setIsOfflineCached(true);
            });
          }
          await attachAudioAndMaybePlay(result.audioUrl, autoPlay);
        } else if (autoPlay && result.scriptText) {
          startBrowserSpeech(result.scriptText);
        }

        return result;
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return null;
        setPlaybackError(
          err instanceof Error ? err.message : 'Unable to prepare studio lesson audio.'
        );
        return null;
      } finally {
        if (!controller.signal.aborted) {
          setIsSynthesizing(false);
        }
      }
    },
    [
      attachAudioAndMaybePlay,
      persistRecordToFirestore,
      startBrowserSpeech,
      stopMediaElements,
    ]
  );

  const loadLessonTrackRef = useRef(loadLessonTrack);
  loadLessonTrackRef.current = loadLessonTrack;

  const advanceToServiceId = useCallback((serviceId: string, shouldPlay: boolean) => {
    const targetSvc = AWS_SERVICES.find((s) => s.id === serviceId);
    if (!targetSvc) return;
    const nextLesson = buildLessonFromService(targetSvc, AWS_SERVICES);
    advanceListenersRef.current.forEach((cb) => cb(serviceId));
    void loadLessonTrackRef.current({
      lesson: nextLesson,
      autoPlay: shouldPlay,
    });
  }, []);

  const playNextLesson = useCallback(() => {
    const current = activeLessonRef.current;
    if (!current?.nextServiceId) return;
    advanceToServiceId(current.nextServiceId, true);
  }, [advanceToServiceId]);

  const playPrevLesson = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 4) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    const current = activeLessonRef.current;
    if (!current?.prevServiceId) return;
    advanceToServiceId(current.prevServiceId, isPlayingRef.current || isSpeechPlayingRef.current);
  }, [advanceToServiceId]);

  const handleTrackCompleted = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    wantsPlaybackOnRecoveryRef.current = false;

    if (sleepTimerModeRef.current === 'end') {
      setSleepTimerMode('off');
      setSleepRemainingSec(null);
      return;
    }

    const current = activeLessonRef.current;
    if (autoPlayEnabledRef.current && current?.nextServiceId) {
      advanceToServiceId(current.nextServiceId, true);
    }
  }, [advanceToServiceId]);

  // Create and bind single persistent <audio> element across the whole app lifecycle
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    const onLoadStart = () => {
      if (audio.src) setIsBuffering(true);
    };
    const onLoadedMetadata = () => {
      setIsBuffering(false);
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
      audio.playbackRate = playbackRateRef.current;
    };
    const onDurationChange = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const onCanPlay = () => setIsBuffering(false);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => {
      setIsBuffering(false);
      setIsPlaying(true);
      wantsPlaybackOnRecoveryRef.current = false;
    };
    const onTimeUpdate = () => {
      const time = audio.currentTime || 0;
      setCurrentTime(time);
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);

        // 60% gapless prefetch for the next lesson when Auto-Play is active
        const lesson = activeLessonRef.current;
        if (
          autoPlayEnabledRef.current &&
          lesson?.nextServiceId &&
          time / audio.duration >= 0.6
        ) {
          const nextSvc = AWS_SERVICES.find((s) => s.id === lesson.nextServiceId);
          if (nextSvc) {
            const prefetchKey = `${nextSvc.id}:${voiceKeyRef.current}`;
            if (
              !prefetchAttemptedRef.current.has(prefetchKey) &&
              !prefetchedLessonsRef.current.has(prefetchKey)
            ) {
              prefetchAttemptedRef.current.add(prefetchKey);
              const nextInput = buildLessonFromService(nextSvc, AWS_SERVICES);
              void requestProLessonAudio({
                lessonType: 'service',
                lessonId: nextInput.serviceId,
                voiceKey: voiceKeyRef.current,
                title: nextInput.title,
                summary: nextInput.summary,
                facts: nextInput.facts,
                examTip: nextInput.examTip,
              })
                .then((res) => {
                  prefetchedLessonsRef.current.set(prefetchKey, res);
                  if (res.audioMode === 'elevenlabs' && res.audioUrl) {
                    void saveAudioOffline(res.audioUrl);
                  }
                })
                .catch(() => {
                  // Ignore silent prefetch errors
                });
            }
          }
        }
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => handleTrackCompleted();
    const onError = () => {
      setIsPlaying(false);
      setIsBuffering(false);
      const track = activeTrackRef.current;
      const lesson = activeLessonRef.current;
      if (
        track?.cacheKey &&
        lesson?.summary?.trim() &&
        recoveredCacheKeyRef.current !== track.cacheKey
      ) {
        recoveredCacheKeyRef.current = track.cacheKey;
        void loadLessonTrackRef.current({
          lesson,
          forceRegenerate: true,
          autoPlay: wantsPlaybackOnRecoveryRef.current,
        });
        return;
      }
      wantsPlaybackOnRecoveryRef.current = false;
      setPlaybackError('Unable to load the stored studio audio stream.');
    };

    audio.addEventListener('loadstart', onLoadStart);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('loadstart', onLoadStart);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.removeAttribute('src');
      audioRef.current = null;
      revokeObjectUrl();
    };
  }, [handleTrackCompleted, revokeObjectUrl]);

  // Keep playbackRate synced
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Check offline cache status whenever track URL updates
  useEffect(() => {
    const url = activeTrack?.audioMode === 'elevenlabs' ? activeTrack.audioUrl : null;
    if (!url) {
      setIsOfflineCached(false);
      return;
    }
    let active = true;
    void isAudioCachedOffline(url).then((cached) => {
      if (active) setIsOfflineCached(cached);
    });
    return () => {
      active = false;
    };
  }, [activeTrack?.audioMode, activeTrack?.audioUrl]);

  // Sleep Timer countdown interval
  useEffect(() => {
    if (typeof sleepTimerMode !== 'number') {
      setSleepRemainingSec(null);
      return;
    }
    setSleepRemainingSec(sleepTimerMode * 60);
    const id = window.setInterval(() => {
      setSleepRemainingSec((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          stopMediaElements();
          setSleepTimerMode('off');
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [sleepTimerMode, stopMediaElements]);

  const pausePlayback = useCallback(() => {
    wantsPlaybackOnRecoveryRef.current = false;
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
    if (isSpeechPlayingRef.current && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore cancel error
      }
      utteranceRef.current = null;
      setIsSpeechPlaying(false);
    }
  }, []);

  const resumePlayback = useCallback(() => {
    setPlaybackError(null);
    const track = activeTrackRef.current;
    const lesson = activeLessonRef.current;

    if (track?.audioMode === 'elevenlabs' && track.audioUrl && audioRef.current) {
      const audio = audioRef.current;
      audio.playbackRate = playbackRateRef.current;
      wantsPlaybackOnRecoveryRef.current = true;
      void audio.play().catch(() => {
        setIsPlaying(false);
        wantsPlaybackOnRecoveryRef.current = false;
        setPlaybackError('Tap play again to start audio playback in this browser.');
      });
      return;
    }

    if (track?.audioMode === 'browser-fallback' && track.scriptText) {
      startBrowserSpeech(track.scriptText, () => {
        const cur = activeLessonRef.current;
        if (autoPlayEnabledRef.current && cur?.nextServiceId) {
          advanceToServiceId(cur.nextServiceId, true);
        }
      });
      return;
    }

    if (lesson) {
      void loadLessonTrackRef.current({ lesson, autoPlay: true });
    }
  }, [advanceToServiceId, startBrowserSpeech]);

  const togglePlayPause = useCallback(() => {
    if (isSynthesizing) return;
    if (isPlayingRef.current || isSpeechPlayingRef.current) {
      duckedByVoiceRef.current = false;
      pausePlayback();
    } else {
      resumePlayback();
    }
  }, [isSynthesizing, pausePlayback, resumePlayback]);

  const seekTo = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    const audio = audioRef.current;
    if (!audio) return;
    const maxDur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : seconds;
    const clamped = Math.max(0, Math.min(seconds, maxDur));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  }, []);

  const skipBy = useCallback(
    (deltaSeconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      seekTo((audio.currentTime || 0) + deltaSeconds);
    },
    [seekTo]
  );

  const replayFromStart = useCallback(() => {
    seekTo(0);
    resumePlayback();
  }, [resumePlayback, seekTo]);

  const stopAndDismiss = useCallback(() => {
    synthAbortRef.current?.abort();
    stopMediaElements();
    revokeObjectUrl();
    setActiveLesson(null);
    setActiveTrack(null);
    setPlaybackError(null);
    setIsSynthesizing(false);
    setSleepTimerMode('off');
    setSleepRemainingSec(null);
    duckedByVoiceRef.current = false;
  }, [revokeObjectUrl, stopMediaElements]);

  // Voice Mic Audio Ducking (automatically pause narration when listening for voice commands)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ listening?: boolean }>).detail;
      const listening = Boolean(detail?.listening);
      if (listening) {
        if (isPlayingRef.current || isSpeechPlayingRef.current) {
          duckedByVoiceRef.current = true;
          pausePlayback();
        }
      } else if (duckedByVoiceRef.current) {
        duckedByVoiceRef.current = false;
        resumePlayback();
      }
    };
    window.addEventListener('cloudprep-voice-listening', handler);
    return () => window.removeEventListener('cloudprep-voice-listening', handler);
  }, [pausePlayback, resumePlayback]);

  // Lock Screen, Control Center, AirPods & CarPlay MediaSession API integration
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;

    if (!activeLesson) {
      ms.metadata = null;
      ms.playbackState = 'none';
      return;
    }

    try {
      ms.metadata = new MediaMetadata({
        title: activeLesson.title,
        artist: `CloudPrep CLF-C02 · ${activeTrack?.voiceLabel || 'Instructor'}`,
        album: activeLesson.domainTitle || 'AWS Cloud Practitioner Audio',
        artwork: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      });
    } catch {
      // Ignore MediaMetadata errors on older browsers
    }

    ms.playbackState = isPlaying || isSpeechPlaying ? 'playing' : 'paused';
  }, [activeLesson, activeTrack?.voiceLabel, isPlaying, isSpeechPlaying]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const safeHandler = (
      action: MediaSessionAction,
      fn: MediaSessionActionHandler | null
    ) => {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        // Ignore unsupported MediaSession action on platform
      }
    };

    if (!activeLesson) {
      safeHandler('play', null);
      safeHandler('pause', null);
      safeHandler('stop', null);
      safeHandler('seekbackward', null);
      safeHandler('seekforward', null);
      safeHandler('seekto', null);
      safeHandler('previoustrack', null);
      safeHandler('nexttrack', null);
      return;
    }

    safeHandler('play', () => resumePlayback());
    safeHandler('pause', () => pausePlayback());
    safeHandler('stop', () => stopAndDismiss());
    safeHandler('seekbackward', (details) => skipBy(-(details.seekOffset || 15)));
    safeHandler('seekforward', (details) => skipBy(details.seekOffset || 15));
    safeHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number') {
        seekTo(details.seekTime);
      }
    });
    safeHandler('previoustrack', activeLesson.prevServiceId ? () => playPrevLesson() : null);
    safeHandler('nexttrack', activeLesson.nextServiceId ? () => playNextLesson() : null);
  }, [
    activeLesson,
    pausePlayback,
    playNextLesson,
    playPrevLesson,
    resumePlayback,
    seekTo,
    skipBy,
    stopAndDismiss,
  ]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    if (typeof ms.setPositionState !== 'function') return;
    if (!activeLesson || !Number.isFinite(duration) || duration <= 0) return;

    try {
      ms.setPositionState({
        duration,
        playbackRate,
        position: Math.min(currentTime, duration),
      });
    } catch {
      // Ignore transient setPositionState rounding errors
    }
  }, [activeLesson, currentTime, duration, playbackRate]);

  const hydrateTrackFromFirestore = useCallback(
    (lesson: ActiveAudioLesson, record: ServiceAudioRecord) => {
      const current = activeLessonRef.current;
      // Don't hijack playback if a different lesson is actively playing or queued globally
      if (
        current &&
        current.serviceId !== lesson.serviceId &&
        (isPlayingRef.current || isSpeechPlayingRef.current)
      ) {
        return;
      }

      const trackFromRecord: ProLessonAudioResponse = {
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

      setActiveLesson(lesson);
      setActiveTrack(trackFromRecord);
      setVoiceKey(record.voiceKey);
      setPlaybackError(null);
      if (record.audioUrl) {
        void attachAudioAndMaybePlay(record.audioUrl, false);
      }
    },
    [attachAudioAndMaybePlay]
  );

  const setVoicePreference = useCallback((nextVoice: AudioVoiceKey) => {
    setVoiceKey(nextVoice);
    setPreferredVoice(nextVoice);
  }, []);

  const cyclePlaybackRate = useCallback(() => {
    setPlaybackRate((prev) => {
      const idx = PLAYBACK_SPEED_OPTIONS.indexOf(
        prev as (typeof PLAYBACK_SPEED_OPTIONS)[number]
      );
      const next = PLAYBACK_SPEED_OPTIONS[(idx + 1) % PLAYBACK_SPEED_OPTIONS.length];
      try {
        window.localStorage.setItem(SPEED_PREF_KEY, String(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  }, []);

  const toggleAutoPlay = useCallback(() => {
    setAutoPlayEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(AUTOPLAY_PREF_KEY, String(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  }, []);

  const cycleSleepTimer = useCallback(() => {
    const order: SleepTimerMode[] = ['off', 'end', 10, 20];
    setSleepTimerMode((prev) => order[(order.indexOf(prev) + 1) % order.length]);
  }, []);

  const toggleOfflineSave = useCallback(async () => {
    const url = activeTrackRef.current?.audioMode === 'elevenlabs'
      ? activeTrackRef.current.audioUrl
      : null;
    if (!url || isSavingOffline) return;

    setIsSavingOffline(true);
    try {
      if (isOfflineCached) {
        await removeAudioOffline(url);
        setIsOfflineCached(false);
      } else {
        const saved = await saveAudioOffline(url);
        setIsOfflineCached(saved);
      }
    } finally {
      setIsSavingOffline(false);
    }
  }, [isOfflineCached, isSavingOffline]);

  const subscribeAdvanceListener = useCallback((cb: (serviceId: string) => void) => {
    advanceListenersRef.current.add(cb);
    return () => {
      advanceListenersRef.current.delete(cb);
    };
  }, []);

  const value = useMemo<AudioPlayerContextValue>(
    () => ({
      statusInfo,
      activeLesson,
      activeTrack,
      voiceKey,
      playbackRate,
      autoPlayEnabled,
      sleepTimerMode,
      sleepRemainingSec,
      isPlaying,
      isSpeechPlaying,
      isSynthesizing,
      isBuffering,
      isOfflineCached,
      isSavingOffline,
      currentTime,
      duration,
      playbackError,
      inlineOwnerServiceId,
      setInlineOwnerServiceId,
      setVoicePreference,
      cyclePlaybackRate,
      toggleAutoPlay,
      cycleSleepTimer,
      loadLessonTrack,
      hydrateTrackFromFirestore,
      togglePlayPause,
      pausePlayback,
      resumePlayback,
      stopAndDismiss,
      replayFromStart,
      seekTo,
      skipBy,
      playNextLesson,
      playPrevLesson,
      toggleOfflineSave,
      subscribeAdvanceListener,
    }),
    [
      statusInfo,
      activeLesson,
      activeTrack,
      voiceKey,
      playbackRate,
      autoPlayEnabled,
      sleepTimerMode,
      sleepRemainingSec,
      isPlaying,
      isSpeechPlaying,
      isSynthesizing,
      isBuffering,
      isOfflineCached,
      isSavingOffline,
      currentTime,
      duration,
      playbackError,
      inlineOwnerServiceId,
      setVoicePreference,
      cyclePlaybackRate,
      toggleAutoPlay,
      cycleSleepTimer,
      loadLessonTrack,
      hydrateTrackFromFirestore,
      togglePlayPause,
      pausePlayback,
      resumePlayback,
      stopAndDismiss,
      replayFromStart,
      seekTo,
      skipBy,
      playNextLesson,
      playPrevLesson,
      toggleOfflineSave,
      subscribeAdvanceListener,
    ]
  );

  return <AudioPlayerContext.Provider value={value}>{children}</AudioPlayerContext.Provider>;
}

export function useAudioPlayer(): AudioPlayerContextValue {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) {
    throw new Error('useAudioPlayer must be used within AudioPlayerProvider');
  }
  return ctx;
}
