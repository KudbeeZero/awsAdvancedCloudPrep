import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ArcadeMode, ArcadeRunResult } from './components/ArcadeBlitzArena';
import { GlobalAudioMiniPlayer } from './components/GlobalAudioMiniPlayer';
import { OverviewSection } from './components/OverviewSection';
import { OfflineIndicator } from './components/PWAInstallButton';
import type { QuizMode } from './components/QuizzesSection';
import type { CoachTab } from './components/StudyCoachSheet';
import { TopNav } from './components/TopNav';
import { VoiceCommandControl } from './components/VoiceCommandControl';
import { useAudioPlayer } from './context/AudioPlayerContext';
import type { VoiceCommandAction } from './utils/voiceCommands';
import {
  ArcadeStats,
  DomainId,
  Flashcard,
  FlashcardConfidence,
  NavSection,
  QuizAttemptRecord,
  SrsGrade,
  SrsItemState,
  StudyProgress,
} from './data/types';
import {
  clearLocalDailyChallenge,
  DAILY_CHALLENGE_BONUS_XP,
  DAILY_GOAL_BONUS_XP,
  getCloudRank,
  getLocalDateKey,
  saveDailyChallengeResult,
  updateDailyArcadeProgress,
} from './utils/arcade';
import { getFriendlyFirestoreError } from './lib/firebase';
import { playLevelUpSound } from './utils/audio';
import { triggerMilestoneHaptic } from './utils/haptics';
import {
  ActiveStudyContext,
  buildProgressSnapshot,
} from './utils/coachProgress';
import {
  CoachSessionState,
  getOrCreateCoachSessionId,
  loadCoachSessionState,
  mergeCoachSessions,
  rotateCoachSession,
  saveCoachSessionState,
} from './utils/coachSession';
import { useAuth } from './context/AuthContext';
import {
  ensureUserAccountDocs,
  loadUserCloudState,
  loadUserCoachSession,
  mergeStudyProgress,
  resetUserCloudProgress,
  saveQuizAttemptToCloud,
  saveUserCoachSession,
  saveUserStudyProgress,
  subscribeToCoachSession,
  subscribeToUserProgress,
} from './utils/cloudSync';
import {
  computeNextSrsState,
  deriveConfidenceFromSrs,
} from './utils/spacedRepetition';

// Lazy-load secondary workspaces so initial FCP renders Overview immediately
const ServiceGuideSection = lazy(() =>
  import('./components/ServiceGuideSection').then((m) => ({
    default: m.ServiceGuideSection,
  }))
);
const PracticeLabsSection = lazy(() =>
  import('./components/PracticeLabsSection').then((m) => ({
    default: m.PracticeLabsSection,
  }))
);
const QuizzesSection = lazy(() =>
  import('./components/QuizzesSection').then((m) => ({
    default: m.QuizzesSection,
  }))
);
const FlashcardsSection = lazy(() =>
  import('./components/FlashcardsSection').then((m) => ({
    default: m.FlashcardsSection,
  }))
);
const StudyCoachSheet = lazy(() =>
  import('./components/StudyCoachSheet').then((m) => ({
    default: m.StudyCoachSheet,
  }))
);

const STORAGE_KEY = 'cloudprep_clf_c02_progress_v1';
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const DEFAULT_ARCADE: ArcadeStats = {
  xp: 0,
  bestBlitzScore: 0,
  bestSurvivalStreak: 0,
  longestCombo: 0,
  gamesPlayed: 0,
  streakDays: 0,
  lastActiveDate: '',
  dailyXp: 0,
  dailyDate: '',
  dailyGoalBonusDate: undefined,
};

const DEFAULT_PROGRESS: StudyProgress = {
  reviewedServices: [],
  completedScenarios: [],
  perfectScenarios: [],
  claimedAchievements: [],
  flashcardConfidence: {},
  flashcardSrs: {},
  quizSrs: {},
  quizHistory: [],
  arcade: DEFAULT_ARCADE,
};

function clampNonNegInt(val: unknown, max = 1_000_000): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return 0;
  return Math.min(max, Math.max(0, Math.floor(val)));
}

function sanitizeDateKey(val: unknown): string {
  return typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : '';
}

function sanitizeRecord<T>(raw: unknown): Record<string, T> {
  const safe: Record<string, T> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return safe;
  for (const [key, val] of Object.entries(raw)) {
    if (!FORBIDDEN_KEYS.has(key) && val !== undefined) {
      safe[key] = val as T;
    }
  }
  return safe;
}

function migrateLegacyConfidenceToSrs(
  legacyConfidence: Record<string, FlashcardConfidence>
): Record<string, SrsItemState> {
  const migrated: Record<string, SrsItemState> = {};
  const now = new Date();
  Object.entries(legacyConfidence).forEach(([cardId, level]) => {
    if (FORBIDDEN_KEYS.has(cardId)) return;
    const grade: SrsGrade =
      level === 'mastered' ? 'easy' : level === 'familiar' ? 'good' : 'again';
    let state = computeNextSrsState(undefined, grade, now);
    if (level === 'mastered') {
      state = computeNextSrsState(state, 'good', now);
    }
    migrated[cardId] = state;
  });
  return migrated;
}

function loadProgress(): StudyProgress {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<StudyProgress>;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_PROGRESS;

    const legacyConf = sanitizeRecord<FlashcardConfidence>(parsed.flashcardConfidence);
    const parsedFlashcardSrs =
      parsed.flashcardSrs && typeof parsed.flashcardSrs === 'object'
        ? sanitizeRecord<SrsItemState>(parsed.flashcardSrs)
        : migrateLegacyConfidenceToSrs(legacyConf);

    const rawArcade = (parsed.arcade && typeof parsed.arcade === 'object'
      ? parsed.arcade
      : {}) as Partial<ArcadeStats>;

    return {
      reviewedServices: Array.isArray(parsed.reviewedServices)
        ? parsed.reviewedServices.filter((s): s is string => typeof s === 'string').slice(0, 200)
        : [],
      completedScenarios: Array.isArray(parsed.completedScenarios)
        ? parsed.completedScenarios.filter((s): s is string => typeof s === 'string').slice(0, 100)
        : [],
      perfectScenarios: Array.isArray(parsed.perfectScenarios)
        ? parsed.perfectScenarios.filter((s): s is string => typeof s === 'string').slice(0, 100)
        : [],
      claimedAchievements: Array.isArray(parsed.claimedAchievements)
        ? parsed.claimedAchievements.filter((s): s is string => typeof s === 'string').slice(0, 50)
        : [],
      flashcardConfidence: legacyConf,
      flashcardSrs: parsedFlashcardSrs,
      quizSrs: sanitizeRecord<SrsItemState>(parsed.quizSrs),
      quizHistory: Array.isArray(parsed.quizHistory) ? parsed.quizHistory.slice(-100) : [],
      arcade: {
        xp: clampNonNegInt(rawArcade.xp),
        bestBlitzScore: clampNonNegInt(rawArcade.bestBlitzScore),
        bestSurvivalStreak: clampNonNegInt(rawArcade.bestSurvivalStreak, 5000),
        longestCombo: clampNonNegInt(rawArcade.longestCombo, 5000),
        gamesPlayed: clampNonNegInt(rawArcade.gamesPlayed, 100_000),
        streakDays: clampNonNegInt(rawArcade.streakDays, 10_000),
        lastActiveDate: sanitizeDateKey(rawArcade.lastActiveDate),
        dailyXp: clampNonNegInt(rawArcade.dailyXp, 100_000),
        dailyDate: sanitizeDateKey(rawArcade.dailyDate),
        dailyGoalBonusDate: sanitizeDateKey(rawArcade.dailyGoalBonusDate) || undefined,
        dailyXpHistory: (() => {
          const hist = sanitizeRecord<number>(rawArcade.dailyXpHistory);
          const clean: Record<string, number> = {};
          for (const [k, v] of Object.entries(hist)) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(k)) {
              clean[k] = clampNonNegInt(v, 100_000);
            }
          }
          return clean;
        })(),
        dailyChallengeDate: sanitizeDateKey(rawArcade.dailyChallengeDate) || undefined,
        dailyChallengeScore:
          typeof rawArcade.dailyChallengeScore === 'number'
            ? clampNonNegInt(rawArcade.dailyChallengeScore, 100_000)
            : undefined,
        dailyChallengeCorrect:
          typeof rawArcade.dailyChallengeCorrect === 'number'
            ? clampNonNegInt(rawArcade.dailyChallengeCorrect, 20)
            : undefined,
        dailyChallengeTotal:
          typeof rawArcade.dailyChallengeTotal === 'number'
            ? Math.max(1, clampNonNegInt(rawArcade.dailyChallengeTotal, 20))
            : undefined,
      },
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

function WorkspaceFallback() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 animate-pulse space-y-4">
      <div className="h-6 w-56 bg-slate-200 rounded" />
      <div className="h-4 w-80 bg-slate-100 rounded" />
      <div className="h-48 w-full bg-slate-100 rounded-xl mt-4" />
    </div>
  );
}

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [serviceDomainFilter, setServiceDomainFilter] = useState<DomainId | 'all'>('all');
  const [requestedServiceId, setRequestedServiceId] = useState<string | null>(null);
  const [quizPresetMode, setQuizPresetMode] = useState<QuizMode>('practice');
  const [quizPresetArenaMode, setQuizPresetArenaMode] = useState<ArcadeMode>('blitz');
  const [quizPresetDomain, setQuizPresetDomain] = useState<DomainId | 'all'>('all');
  const [quizAutoStart, setQuizAutoStart] = useState<boolean>(false);
  const [quizSessionKey, setQuizSessionKey] = useState<number>(0);

  const audioPlayer = useAudioPlayer();
  const { user, isAuthReady } = useAuth();
  const [progress, setProgress] = useState<StudyProgress>(loadProgress);
  const progressRef = useRef<StudyProgress>(progress);
  progressRef.current = progress;
  const cloudSyncedUidRef = useRef<string | null>(null);
  const cloudDocExistsRef = useRef<boolean>(false);
  const skipNextCloudSaveRef = useRef<boolean>(false);
  const cloudSaveTimerRef = useRef<number | null>(null);
  const [syncNonce, setSyncNonce] = useState<number>(0);
  const [cloudSync, setCloudSync] = useState<{
    status: 'local' | 'connecting' | 'syncing' | 'synced' | 'error';
    error: string | null;
    lastSyncedAt: string | null;
  }>({
    status: 'local',
    error: null,
    lastSyncedAt: null,
  });

  const [xpToast, setXpToast] = useState<{
    id: number;
    headline: string;
    detail?: string;
    isLevelUp?: boolean;
  } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // Study Coach Agent state (persisted per isolated session and synced to Cloud Firestore)
  const [coachSession, setCoachSession] = useState<CoachSessionState>(() =>
    loadCoachSessionState(getOrCreateCoachSessionId())
  );
  const coachSessionRef = useRef<CoachSessionState>(coachSession);
  coachSessionRef.current = coachSession;
  const coachDocExistsRef = useRef<boolean>(false);
  const skipNextCoachCloudSaveRef = useRef<boolean>(false);
  const coachSaveTimerRef = useRef<number | null>(null);

  const [coachOpen, setCoachOpen] = useState<boolean>(false);
  const [coachTab, setCoachTab] = useState<CoachTab>('briefing');
  const [pendingCoachPrompt, setPendingCoachPrompt] = useState<string | null>(null);
  const [hintTriggerCount, setHintTriggerCount] = useState<number>(0);
  const [unreadUpdatesCount, setUnreadUpdatesCount] = useState<number>(0);
  const [recentEvent, setRecentEvent] = useState<string | undefined>(undefined);
  const [activeContext, setActiveContext] = useState<ActiveStudyContext>({
    type: 'overview',
    title: 'CLF-C02 Exam Blueprint & Study Readiness',
  });

  const LAST_SYNCED_UID_KEY = 'cloudprep_last_synced_uid_v1';

  // Deep-link launcher for PWA Home Screen shortcuts (?action=daily|blitz|flashcards|labs|services)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const action = params.get('action');
      if (!action) return;

      if (action === 'daily') {
        setQuizPresetMode('blitz');
        setQuizPresetArenaMode('daily');
        setQuizPresetDomain('all');
        setQuizAutoStart(true);
        setQuizSessionKey((k) => k + 1);
        setActiveSection('quizzes');
      } else if (action === 'blitz') {
        setQuizPresetMode('blitz');
        setQuizPresetArenaMode('blitz');
        setQuizPresetDomain('all');
        setQuizAutoStart(true);
        setQuizSessionKey((k) => k + 1);
        setActiveSection('quizzes');
      } else if (action === 'flashcards') {
        setActiveSection('flashcards');
      } else if (action === 'labs') {
        setActiveSection('practice');
      } else if (action === 'services') {
        setActiveSection('services');
      }

      params.delete('action');
      const cleaned = params.toString();
      const nextUrl = `${window.location.pathname}${cleaned ? `?${cleaned}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', nextUrl);
    } catch {
      // Ignore invalid URL query parsing gracefully
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // Ignore storage quota errors gracefully
    }
  }, [progress]);

  // Synchronize authenticated user's progress with Cloud Firestore
  useEffect(() => {
    if (!isAuthReady) return;
    if (!user || !user.emailVerified) {
      if (cloudSyncedUidRef.current) {
        // User just signed out: clear local snapshot and rotate coach session so the next account starts clean
        try {
          window.localStorage.removeItem(LAST_SYNCED_UID_KEY);
        } catch {
          // Ignore storage error
        }
        clearLocalDailyChallenge();
        skipNextCloudSaveRef.current = true;
        setProgress(DEFAULT_PROGRESS);
        skipNextCoachCloudSaveRef.current = true;
        setCoachSession((prev) => rotateCoachSession(prev.sessionId));
        setUnreadUpdatesCount(0);
        setRecentEvent(undefined);
      }
      cloudSyncedUidRef.current = null;
      cloudDocExistsRef.current = false;
      coachDocExistsRef.current = false;
      setCloudSync({
        status: 'local',
        error: null,
        lastSyncedAt: null,
      });
      return;
    }

    let cancelled = false;
    let unsubscribeSnapshot: (() => void) | null = null;
    let unsubscribeCoachSnapshot: (() => void) | null = null;

    setCloudSync((prev) => ({
      status: 'connecting',
      error: null,
      lastSyncedAt: prev.lastSyncedAt,
    }));

    (async () => {
      try {
        await ensureUserAccountDocs(user);
        if (cancelled) return;

        const [cloud, remoteCoach] = await Promise.all([
          loadUserCloudState(user.uid),
          loadUserCoachSession(user.uid),
        ]);
        if (cancelled) return;

        let previousUid: string | null = null;
        try {
          previousUid = window.localStorage.getItem(LAST_SYNCED_UID_KEY);
          window.localStorage.setItem(LAST_SYNCED_UID_KEY, user.uid);
        } catch {
          // Ignore storage error
        }

        const isAccountSwitch = Boolean(previousUid && previousUid !== user.uid);
        if (isAccountSwitch) {
          clearLocalDailyChallenge();
          setUnreadUpdatesCount(0);
          setRecentEvent(undefined);
        }

        // Only merge local guest data if there wasn't a different user cached locally
        const localSnapshot = isAccountSwitch ? DEFAULT_PROGRESS : progressRef.current;
        const merged = mergeStudyProgress(
          localSnapshot,
          cloud.progressData,
          cloud.attempts
        );

        const localCoachSnapshot = isAccountSwitch
          ? rotateCoachSession(coachSessionRef.current.sessionId)
          : coachSessionRef.current;
        const mergedCoach = mergeCoachSessions(localCoachSnapshot, remoteCoach.data);

        cloudDocExistsRef.current = cloud.progressExists;
        skipNextCloudSaveRef.current = true;
        setProgress(merged);

        coachDocExistsRef.current = remoteCoach.exists;
        skipNextCoachCloudSaveRef.current = true;
        setCoachSession(mergedCoach);

        const [existsAfterSave, coachExistsAfterSave] = await Promise.all([
          saveUserStudyProgress(user.uid, merged, cloud.progressExists),
          saveUserCoachSession(user.uid, mergedCoach, remoteCoach.exists),
        ]);
        if (cancelled) return;
        cloudDocExistsRef.current = existsAfterSave;
        coachDocExistsRef.current = coachExistsAfterSave;
        cloudSyncedUidRef.current = user.uid;

        const remoteIds = new Set(cloud.attempts.map((a) => a.id));
        const unsyncedAttempts = localSnapshot.quizHistory.filter(
          (att) => !remoteIds.has(att.id)
        );
        for (const att of unsyncedAttempts) {
          if (cancelled) break;
          await saveQuizAttemptToCloud(user.uid, att);
        }

        if (!cancelled) {
          setCloudSync({
            status: 'synced',
            error: null,
            lastSyncedAt: new Date().toISOString(),
          });

          unsubscribeSnapshot = subscribeToUserProgress(
            user.uid,
            (remoteData) => {
              skipNextCloudSaveRef.current = true;
              cloudDocExistsRef.current = true;
              setProgress((prev) =>
                mergeStudyProgress(prev, remoteData, prev.quizHistory)
              );
              setCloudSync({
                status: 'synced',
                error: null,
                lastSyncedAt: new Date().toISOString(),
              });
            },
            (syncErr) => {
              setCloudSync((prev) => ({
                status: 'error',
                error: getFriendlyFirestoreError(syncErr),
                lastSyncedAt: prev.lastSyncedAt,
              }));
            }
          );

          unsubscribeCoachSnapshot = subscribeToCoachSession(
            user.uid,
            (remoteCoachData) => {
              skipNextCoachCloudSaveRef.current = true;
              coachDocExistsRef.current = true;
              setCoachSession((prev) => mergeCoachSessions(prev, remoteCoachData));
              setCloudSync({
                status: 'synced',
                error: null,
                lastSyncedAt: new Date().toISOString(),
              });
            },
            (syncErr) => {
              setCloudSync((prev) => ({
                status: 'error',
                error: getFriendlyFirestoreError(syncErr),
                lastSyncedAt: prev.lastSyncedAt,
              }));
            }
          );
        }
      } catch (error) {
        console.error('Cloud study sync error:', error);
        if (!cancelled) {
          setCloudSync((prev) => ({
            status: 'error',
            error: getFriendlyFirestoreError(error),
            lastSyncedAt: prev.lastSyncedAt,
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
      if (unsubscribeCoachSnapshot) {
        unsubscribeCoachSnapshot();
      }
    };
  }, [isAuthReady, user, syncNonce]);

  // Persist local progress edits to Firestore with a short debounce
  useEffect(() => {
    if (!user || !user.emailVerified || cloudSyncedUidRef.current !== user.uid) {
      return;
    }
    if (skipNextCloudSaveRef.current) {
      skipNextCloudSaveRef.current = false;
      return;
    }

    if (cloudSaveTimerRef.current !== null) {
      window.clearTimeout(cloudSaveTimerRef.current);
    }

    setCloudSync((prev) => ({
      status: 'syncing',
      error: null,
      lastSyncedAt: prev.lastSyncedAt,
    }));

    cloudSaveTimerRef.current = window.setTimeout(() => {
      cloudSaveTimerRef.current = null;
      void saveUserStudyProgress(user.uid, progress, cloudDocExistsRef.current)
        .then((existsNow) => {
          cloudDocExistsRef.current = existsNow;
          setCloudSync({
            status: 'synced',
            error: null,
            lastSyncedAt: new Date().toISOString(),
          });
        })
        .catch((error) => {
          console.error('Cloud progress update failed:', error);
          setCloudSync((prev) => ({
            status: 'error',
            error: getFriendlyFirestoreError(error),
            lastSyncedAt: prev.lastSyncedAt,
          }));
        });
    }, 500);

    return () => {
      if (cloudSaveTimerRef.current !== null) {
        window.clearTimeout(cloudSaveTimerRef.current);
        cloudSaveTimerRef.current = null;
      }
    };
  }, [progress, user]);

  useEffect(() => {
    saveCoachSessionState(coachSession);
  }, [coachSession]);

  // Persist Study Coach session edits (briefing, study plan checks, hints, chat) to Firestore
  useEffect(() => {
    if (!user || !user.emailVerified || cloudSyncedUidRef.current !== user.uid) {
      return;
    }
    if (skipNextCoachCloudSaveRef.current) {
      skipNextCoachCloudSaveRef.current = false;
      return;
    }

    if (coachSaveTimerRef.current !== null) {
      window.clearTimeout(coachSaveTimerRef.current);
    }

    setCloudSync((prev) => ({
      status: 'syncing',
      error: null,
      lastSyncedAt: prev.lastSyncedAt,
    }));

    coachSaveTimerRef.current = window.setTimeout(() => {
      coachSaveTimerRef.current = null;
      void saveUserCoachSession(user.uid, coachSession, coachDocExistsRef.current)
        .then((existsNow) => {
          coachDocExistsRef.current = existsNow;
          setCloudSync({
            status: 'synced',
            error: null,
            lastSyncedAt: new Date().toISOString(),
          });
        })
        .catch((error) => {
          console.error('Cloud coach update failed:', error);
          setCloudSync((prev) => ({
            status: 'error',
            error: getFriendlyFirestoreError(error),
            lastSyncedAt: prev.lastSyncedAt,
          }));
        });
    }, 500);

    return () => {
      if (coachSaveTimerRef.current !== null) {
        window.clearTimeout(coachSaveTimerRef.current);
        coachSaveTimerRef.current = null;
      }
    };
  }, [coachSession, user]);

  const handleSyncNow = () => {
    if (!user || !user.emailVerified) {
      setSyncNonce((n) => n + 1);
      return;
    }
    if (cloudSaveTimerRef.current !== null) {
      window.clearTimeout(cloudSaveTimerRef.current);
      cloudSaveTimerRef.current = null;
    }
    if (coachSaveTimerRef.current !== null) {
      window.clearTimeout(coachSaveTimerRef.current);
      coachSaveTimerRef.current = null;
    }
    setCloudSync((prev) => ({
      status: 'syncing',
      error: null,
      lastSyncedAt: prev.lastSyncedAt,
    }));
    void Promise.all([
      saveUserStudyProgress(user.uid, progressRef.current, cloudDocExistsRef.current),
      saveUserCoachSession(user.uid, coachSessionRef.current, coachDocExistsRef.current),
    ])
      .then(([progressExistsNow, coachExistsNow]) => {
        cloudDocExistsRef.current = progressExistsNow;
        coachDocExistsRef.current = coachExistsNow;
        cloudSyncedUidRef.current = user.uid;
        setCloudSync({
          status: 'synced',
          error: null,
          lastSyncedAt: new Date().toISOString(),
        });
      })
      .catch((error) => {
        console.error('Manual cloud sync failed:', error);
        setCloudSync((prev) => ({
          status: 'error',
          error: getFriendlyFirestoreError(error),
          lastSyncedAt: prev.lastSyncedAt,
        }));
      });
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (cloudSaveTimerRef.current !== null) {
        window.clearTimeout(cloudSaveTimerRef.current);
      }
      if (coachSaveTimerRef.current !== null) {
        window.clearTimeout(coachSaveTimerRef.current);
      }
    };
  }, []);

  const showXpFeedback = (
    xpDelta: number,
    prevXp: number,
    contextLabel: string
  ) => {
    if (xpDelta <= 0) return;
    const prevRank = getCloudRank(prevXp);
    const nextRank = getCloudRank(prevXp + xpDelta);
    const leveledUp = nextRank.level > prevRank.level;

    if (leveledUp) {
      playLevelUpSound();
      triggerMilestoneHaptic(true);
    }

    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }

    setXpToast({
      id: Date.now(),
      headline: leveledUp
        ? `Rank Up · Level ${nextRank.level} ${nextRank.title}`
        : `+${xpDelta} XP`,
      detail: leveledUp ? `+${xpDelta} XP earned` : contextLabel,
      isLevelUp: leveledUp,
    });

    toastTimerRef.current = window.setTimeout(() => {
      setXpToast(null);
      toastTimerRef.current = null;
    }, leveledUp ? 2400 : 1500);
  };

  const progressSnapshot = useMemo(
    () => buildProgressSnapshot(progress, activeSection, activeContext, recentEvent),
    [progress, activeSection, activeContext, recentEvent]
  );

  const openCoach = (tab: CoachTab = 'briefing') => {
    setCoachTab(tab);
    setCoachOpen(true);
    if (tab === 'briefing') {
      setUnreadUpdatesCount(0);
    }
  };

  const requestContextHint = () => {
    setHintTriggerCount((c) => c + 1);
    setCoachTab('hint');
    setCoachOpen(true);
  };

  const handleAskCoachFlashcard = (card: Flashcard, isAnswerVisible: boolean) => {
    const prompt = isAnswerVisible
      ? `Give me a crisp 1-line memory hook and key exam distinction for "${card.front.slice(0, 75)}".`
      : `Help me reason through "${card.front.slice(0, 75)}" without spoiling the exact answer.`;
    setPendingCoachPrompt(prompt);
    setCoachTab('chat');
    setCoachOpen(true);
  };

  const handleNavigate = (section: NavSection, domain?: DomainId) => {
    if (section === 'services') {
      setServiceDomainFilter(domain || 'all');
    }
    if (section === 'quizzes' && activeSection !== 'quizzes') {
      setQuizAutoStart(false);
      setQuizSessionKey((k) => k + 1);
    }
    if (section === 'overview') {
      setActiveContext({
        type: 'overview',
        title: 'CLF-C02 Exam Blueprint & Study Readiness',
      });
    }
    setActiveSection(section);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartQuiz = (mode: QuizMode, domain: DomainId | 'all' = 'all') => {
    setQuizPresetMode(mode);
    setQuizPresetArenaMode('blitz');
    setQuizPresetDomain(domain);
    setQuizAutoStart(true);
    setQuizSessionKey((k) => k + 1);
    setActiveSection('quizzes');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartDailyChallenge = () => {
    setQuizPresetMode('blitz');
    setQuizPresetArenaMode('daily');
    setQuizPresetDomain('all');
    setQuizAutoStart(true);
    setQuizSessionKey((k) => k + 1);
    setActiveSection('quizzes');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartArcadeMode = (arenaMode: ArcadeMode) => {
    setQuizPresetMode('blitz');
    setQuizPresetArenaMode(arenaMode);
    setQuizPresetDomain('all');
    setQuizAutoStart(true);
    setQuizSessionKey((k) => k + 1);
    setActiveSection('quizzes');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleVoiceCommand = (
    action: Exclude<VoiceCommandAction, { type: 'stop-listening' }>
  ) => {
    if (action.type === 'audio-control') {
      if (action.command === 'pause') {
        audioPlayer.pausePlayback();
      } else if (action.command === 'play') {
        audioPlayer.resumePlayback();
      } else if (action.command === 'next') {
        audioPlayer.playNextLesson();
      } else if (action.command === 'prev') {
        audioPlayer.playPrevLesson();
      } else if (action.command === 'forward') {
        audioPlayer.skipBy(15);
      } else if (action.command === 'back') {
        audioPlayer.skipBy(-15);
      }
      return;
    }

    if (action.type === 'open-coach') {
      openCoach('briefing');
      return;
    }

    setCoachOpen(false);
    if (action.type === 'navigate') {
      handleNavigate(action.section, action.domain);
    } else if (action.type === 'start-quiz') {
      handleStartQuiz(action.mode, action.domain);
    } else if (action.type === 'start-arcade') {
      handleStartArcadeMode(action.arenaMode);
    }
  };

  const handleToggleReviewedService = (serviceId: string) => {
    const exists = progress.reviewedServices.includes(serviceId);
    const nextList = exists
      ? progress.reviewedServices.filter((id) => id !== serviceId)
      : [...progress.reviewedServices, serviceId];
    const todayKey = getLocalDateKey();

    if (!exists) {
      const xpOutcome = updateDailyArcadeProgress(progress.arcade, 15, todayKey);
      showXpFeedback(
        xpOutcome.totalXpDelta,
        progress.arcade.xp,
        xpOutcome.hitDailyGoalBonus
          ? `Daily Goal Hit (+${DAILY_GOAL_BONUS_XP} bonus XP)`
          : 'Service mastered'
      );
      if (nextList.length % 5 === 0) {
        setRecentEvent(`Reviewed ${nextList.length} AWS core services`);
        setUnreadUpdatesCount((n) => n + 1);
      }
    }

    setProgress((prev) => {
      const prevExists = prev.reviewedServices.includes(serviceId);
      return {
        ...prev,
        reviewedServices: prevExists
          ? prev.reviewedServices.filter((id) => id !== serviceId)
          : [...prev.reviewedServices, serviceId],
        arcade: prevExists
          ? prev.arcade
          : updateDailyArcadeProgress(prev.arcade, 15, todayKey).arcade,
      };
    });
  };

  const handleCompleteScenario = (scenarioId: string, isFirstTryPerfect = false) => {
    const todayKey = getLocalDateKey();
    const isNewCompletion = !progress.completedScenarios.includes(scenarioId);
    const isNewPerfect =
      isFirstTryPerfect && !progress.perfectScenarios.includes(scenarioId);

    if (isNewCompletion || isNewPerfect) {
      const nextCount = isNewCompletion
        ? progress.completedScenarios.length + 1
        : progress.completedScenarios.length;
      const baseXp = isNewCompletion ? (isFirstTryPerfect ? 75 : 60) : 15;
      const xpOutcome = updateDailyArcadeProgress(progress.arcade, baseXp, todayKey);
      showXpFeedback(
        xpOutcome.totalXpDelta,
        progress.arcade.xp,
        xpOutcome.hitDailyGoalBonus
          ? `Daily Goal Hit (+${DAILY_GOAL_BONUS_XP} bonus XP)`
          : isFirstTryPerfect
          ? 'Perfect First-Try Lab!'
          : 'Architecture lab solved'
      );
      setRecentEvent(`Solved practice lab (${nextCount} completed)`);
      setUnreadUpdatesCount((n) => n + 1);
    }

    setProgress((prev) => {
      const prevNewCompletion = !prev.completedScenarios.includes(scenarioId);
      const prevNewPerfect =
        isFirstTryPerfect && !prev.perfectScenarios.includes(scenarioId);
      if (!prevNewCompletion && !prevNewPerfect) return prev;
      const baseXp = prevNewCompletion ? (isFirstTryPerfect ? 75 : 60) : 15;
      return {
        ...prev,
        completedScenarios: prevNewCompletion
          ? [...prev.completedScenarios, scenarioId]
          : prev.completedScenarios,
        perfectScenarios: prevNewPerfect
          ? [...prev.perfectScenarios, scenarioId]
          : prev.perfectScenarios,
        arcade: updateDailyArcadeProgress(prev.arcade, baseXp, todayKey).arcade,
      };
    });
  };

  const handleGradeFlashcard = (cardId: string, grade: SrsGrade) => {
    const todayKey = getLocalDateKey();
    const xpGain = grade === 'easy' ? 25 : grade === 'good' ? 20 : grade === 'hard' ? 10 : 5;
    const xpOutcome = updateDailyArcadeProgress(progress.arcade, xpGain, todayKey);
    showXpFeedback(
      xpOutcome.totalXpDelta,
      progress.arcade.xp,
      xpOutcome.hitDailyGoalBonus
        ? `Daily Goal Hit (+${DAILY_GOAL_BONUS_XP} bonus XP)`
        : `Card graded (${grade})`
    );

    const totalReviewed =
      Object.keys(progress.flashcardSrs).length + (progress.flashcardSrs[cardId] ? 0 : 1);
    if (totalReviewed % 10 === 0) {
      setRecentEvent(`Completed ${totalReviewed} flashcard reviews`);
      setUnreadUpdatesCount((n) => n + 1);
    }

    setProgress((prev) => {
      const nextState = computeNextSrsState(prev.flashcardSrs[cardId], grade, new Date());
      const derivedConf = deriveConfidenceFromSrs(nextState);
      return {
        ...prev,
        flashcardSrs: {
          ...prev.flashcardSrs,
          [cardId]: nextState,
        },
        flashcardConfidence: derivedConf
          ? {
              ...prev.flashcardConfidence,
              [cardId]: derivedConf,
            }
          : prev.flashcardConfidence,
        arcade: updateDailyArcadeProgress(prev.arcade, xpGain, todayKey).arcade,
      };
    });
  };

  const handleResetFlashcardDeck = () => {
    setProgress((prev) => ({
      ...prev,
      flashcardConfidence: {},
      flashcardSrs: {},
    }));
  };

  const handleRecordQuestionSrs = (
    questionId: string,
    isCorrect: boolean,
    isEphemeral = false
  ) => {
    const todayKey = getLocalDateKey();
    const grade: SrsGrade = isCorrect ? 'good' : 'again';
    const xpGain = isCorrect ? 25 : 0;
    if (xpGain > 0) {
      const xpOutcome = updateDailyArcadeProgress(progress.arcade, xpGain, todayKey);
      showXpFeedback(
        xpOutcome.totalXpDelta,
        progress.arcade.xp,
        xpOutcome.hitDailyGoalBonus
          ? `Daily Goal Hit (+${DAILY_GOAL_BONUS_XP} bonus XP)`
          : 'Correct answer'
      );
    }

    setProgress((prev) => ({
      ...prev,
      quizSrs: isEphemeral
        ? prev.quizSrs
        : {
            ...prev.quizSrs,
            [questionId]: computeNextSrsState(prev.quizSrs[questionId], grade, new Date()),
          },
      arcade:
        xpGain > 0
          ? updateDailyArcadeProgress(prev.arcade, xpGain, todayKey).arcade
          : prev.arcade,
    }));
  };

  const handleRecordQuizAttempt = (attempt: QuizAttemptRecord) => {
    setRecentEvent(
      `Completed ${attempt.mode} quiz: ${attempt.correctCount}/${attempt.totalCount} (Scaled ${attempt.scaledScore}/1000)`
    );
    setUnreadUpdatesCount((n) => n + 1);
    setProgress((prev) => ({
      ...prev,
      quizHistory: [...prev.quizHistory, attempt],
    }));

    if (user && user.emailVerified && cloudSyncedUidRef.current === user.uid) {
      void saveQuizAttemptToCloud(user.uid, attempt)
        .then(() => {
          setCloudSync({
            status: 'synced',
            error: null,
            lastSyncedAt: new Date().toISOString(),
          });
        })
        .catch((error) => {
          console.error('Failed to persist quiz attempt:', error);
          setCloudSync((prev) => ({
            status: 'error',
            error: getFriendlyFirestoreError(error),
            lastSyncedAt: prev.lastSyncedAt,
          }));
        });
    }
  };

  const handleCompleteArcadeRun = (result: ArcadeRunResult) => {
    const todayKey = getLocalDateKey();
    let bonusDailyXp = 0;
    let dailyChallengeOutcome: ReturnType<typeof saveDailyChallengeResult> | null = null;
    if (result.mode === 'daily') {
      dailyChallengeOutcome = saveDailyChallengeResult(
        todayKey,
        result.correctCount,
        result.totalAnswered,
        result.score,
        progress.arcade
      );
      if (dailyChallengeOutcome.isFirstCompletionToday) {
        bonusDailyXp = DAILY_CHALLENGE_BONUS_XP;
      }
    }

    const totalEarned = result.xpEarned + bonusDailyXp;
    const xpOutcome = updateDailyArcadeProgress(progress.arcade, totalEarned, todayKey);
    const modeLabel =
      result.mode === 'blitz'
        ? 'Blitz'
        : result.mode === 'daily'
        ? 'Daily 5'
        : 'Survival';

    showXpFeedback(
      xpOutcome.totalXpDelta,
      progress.arcade.xp,
      xpOutcome.hitDailyGoalBonus
        ? `Daily Goal Hit (+${DAILY_GOAL_BONUS_XP} bonus XP)`
        : bonusDailyXp > 0
        ? `Daily 5 Bonus (+${bonusDailyXp} XP)`
        : `${modeLabel} · ${result.score.toLocaleString()} pts`
    );

    const scaledEquivalent =
      result.totalAnswered > 0
        ? Math.round(100 + (result.correctCount / result.totalAnswered) * 900)
        : 100;

    setRecentEvent(
      `Finished ${modeLabel} run: ${result.score.toLocaleString()} pts (${result.correctCount}/${result.totalAnswered})`
    );
    setUnreadUpdatesCount((n) => n + 1);

    const arcadeAttempt: QuizAttemptRecord = {
      id: `arcade-${Date.now()}`,
      dateIso: new Date().toISOString(),
      mode: 'blitz',
      domainFilter: 'all',
      correctCount: result.correctCount,
      totalCount: Math.max(1, result.totalAnswered),
      scaledScore: scaledEquivalent,
    };

    if (user && user.emailVerified && cloudSyncedUidRef.current === user.uid) {
      void saveQuizAttemptToCloud(user.uid, arcadeAttempt)
        .then(() => {
          setCloudSync({
            status: 'synced',
            error: null,
            lastSyncedAt: new Date().toISOString(),
          });
        })
        .catch((error) => {
          console.error('Failed to persist arcade run:', error);
          setCloudSync((prev) => ({
            status: 'error',
            error: getFriendlyFirestoreError(error),
            lastSyncedAt: prev.lastSyncedAt,
          }));
        });
    }

    setProgress((prev) => {
      const nextArcadeBase = updateDailyArcadeProgress(
        prev.arcade,
        totalEarned,
        todayKey
      ).arcade;
      return {
        ...prev,
        quizHistory: [...prev.quizHistory, arcadeAttempt],
        arcade: {
          ...nextArcadeBase,
          bestBlitzScore:
            result.mode === 'blitz'
              ? Math.max(nextArcadeBase.bestBlitzScore, result.score)
              : nextArcadeBase.bestBlitzScore,
          bestSurvivalStreak:
            result.mode === 'survival'
              ? Math.max(nextArcadeBase.bestSurvivalStreak, result.correctCount)
              : nextArcadeBase.bestSurvivalStreak,
          longestCombo: Math.max(nextArcadeBase.longestCombo, result.maxCombo),
          gamesPlayed: nextArcadeBase.gamesPlayed + 1,
          ...(dailyChallengeOutcome
            ? {
                dailyChallengeDate: dailyChallengeOutcome.status.dateKey,
                dailyChallengeScore: dailyChallengeOutcome.status.bestScore,
                dailyChallengeCorrect: dailyChallengeOutcome.status.correctCount,
                dailyChallengeTotal: dailyChallengeOutcome.status.totalCount,
              }
            : {}),
        },
      };
    });
  };

  const handleClaimAchievement = (
    achievementId: string,
    xpReward: number,
    title: string
  ) => {
    if (progress.claimedAchievements.includes(achievementId)) return;
    const todayKey = getLocalDateKey();
    const xpOutcome = updateDailyArcadeProgress(progress.arcade, xpReward, todayKey);
    playLevelUpSound();
    triggerMilestoneHaptic(true);
    showXpFeedback(
      xpOutcome.totalXpDelta,
      progress.arcade.xp,
      `Milestone Unlocked · ${title}`
    );

    setProgress((prev) => {
      if (prev.claimedAchievements.includes(achievementId)) return prev;
      return {
        ...prev,
        claimedAchievements: [...prev.claimedAchievements, achievementId],
        arcade: updateDailyArcadeProgress(prev.arcade, xpReward, todayKey).arcade,
      };
    });
  };

  const handleClaimAllAchievements = (
    items: { id: string; xpReward: number; title: string }[]
  ) => {
    const unclaimed = items.filter(
      (item) => !progress.claimedAchievements.includes(item.id)
    );
    if (unclaimed.length === 0) return;

    const totalReward = unclaimed.reduce((sum, item) => sum + item.xpReward, 0);
    const todayKey = getLocalDateKey();
    const xpOutcome = updateDailyArcadeProgress(progress.arcade, totalReward, todayKey);
    playLevelUpSound();
    triggerMilestoneHaptic(true);
    showXpFeedback(
      xpOutcome.totalXpDelta,
      progress.arcade.xp,
      `Claimed ${unclaimed.length} Milestone${unclaimed.length > 1 ? 's' : ''}`
    );

    setProgress((prev) => {
      const fresh = unclaimed.filter(
        (item) => !prev.claimedAchievements.includes(item.id)
      );
      if (fresh.length === 0) return prev;
      const freshXp = fresh.reduce((sum, item) => sum + item.xpReward, 0);
      return {
        ...prev,
        claimedAchievements: [
          ...prev.claimedAchievements,
          ...fresh.map((item) => item.id),
        ],
        arcade: updateDailyArcadeProgress(prev.arcade, freshXp, todayKey).arcade,
      };
    });
  };

  const handleNewCoachSession = () => {
    setCoachSession((prev) => rotateCoachSession(prev.sessionId));
    setUnreadUpdatesCount(0);
  };

  const handleResetAllProgress = () => {
    clearLocalDailyChallenge();
    skipNextCloudSaveRef.current = true;
    setProgress(DEFAULT_PROGRESS);
    setRecentEvent(undefined);
    setUnreadUpdatesCount(0);
    const rotatedCoach = rotateCoachSession(coachSessionRef.current.sessionId);
    skipNextCoachCloudSaveRef.current = true;
    setCoachSession(rotatedCoach);

    if (user && user.emailVerified && cloudSyncedUidRef.current === user.uid) {
      setCloudSync((prev) => ({
        status: 'syncing',
        error: null,
        lastSyncedAt: prev.lastSyncedAt,
      }));
      void Promise.all([
        resetUserCloudProgress(
          user.uid,
          DEFAULT_PROGRESS,
          cloudDocExistsRef.current
        ),
        saveUserCoachSession(user.uid, rotatedCoach, coachDocExistsRef.current),
      ])
        .then(([, coachExistsNow]) => {
          cloudDocExistsRef.current = true;
          coachDocExistsRef.current = coachExistsNow;
          setCloudSync({
            status: 'synced',
            error: null,
            lastSyncedAt: new Date().toISOString(),
          });
        })
        .catch((error) => {
          console.error('Failed to reset cloud progress:', error);
          setCloudSync((prev) => ({
            status: 'error',
            error: getFriendlyFirestoreError(error),
            lastSyncedAt: prev.lastSyncedAt,
          }));
        });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900 overflow-x-clip">
      <TopNav
        activeSection={activeSection}
        onNavigate={(sec) => handleNavigate(sec)}
        onStartMockExam={() => handleStartQuiz('mock', 'all')}
      />

      <OfflineIndicator />

      <GlobalAudioMiniPlayer
        onOpenLesson={(svcId) => {
          setRequestedServiceId(svcId);
          setServiceDomainFilter('all');
          setActiveSection('services');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* Non-blocking Floating XP & Rank-Up Toast */}
      {xpToast && (
        <div
          key={xpToast.id}
          role="status"
          aria-live="polite"
          className={`fixed top-16 md:top-20 right-3 sm:right-4 max-w-[calc(100vw-1.5rem)] z-40 pointer-events-none px-4 py-2.5 rounded-xl shadow-lg border animate-xp-pop ${
            xpToast.isLevelUp
              ? 'bg-[#C2410C] border-amber-300 text-white'
              : 'bg-slate-900 border-slate-700 text-white'
          }`}
        >
          <p className="font-mono text-xs font-bold tabular-nums">{xpToast.headline}</p>
          {xpToast.detail && (
            <p className="text-[11px] opacity-85">{xpToast.detail}</p>
          )}
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-10 pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] md:pb-12">
        {activeSection === 'overview' && (
          <OverviewSection
            progress={progress}
            cloudSync={cloudSync}
            onRetrySync={() => setSyncNonce((n) => n + 1)}
            onSyncNow={handleSyncNow}
            onNavigate={handleNavigate}
            onStartQuiz={handleStartQuiz}
            onStartDailyChallenge={handleStartDailyChallenge}
            onOpenCoachBriefing={() => openCoach('briefing')}
            onResetProgress={handleResetAllProgress}
            onClaimAchievement={handleClaimAchievement}
            onClaimAllAchievements={handleClaimAllAchievements}
          />
        )}

        <Suspense fallback={<WorkspaceFallback />}>
          {activeSection === 'services' && (
            <ServiceGuideSection
              key={serviceDomainFilter}
              initialDomainFilter={serviceDomainFilter}
              requestedServiceId={requestedServiceId}
              onClearRequestedService={() => setRequestedServiceId(null)}
              reviewedServices={progress.reviewedServices}
              onToggleReviewed={handleToggleReviewedService}
              onStartDomainQuiz={(domain) => handleStartQuiz('drill', domain)}
              onContextChange={setActiveContext}
              onAskCoach={() => openCoach('chat')}
            />
          )}

          {activeSection === 'practice' && (
            <PracticeLabsSection
              completedScenarios={progress.completedScenarios}
              perfectScenarios={progress.perfectScenarios}
              onCompleteScenario={handleCompleteScenario}
              onContextChange={setActiveContext}
              onRequestHint={requestContextHint}
            />
          )}

          {activeSection === 'quizzes' && (
            <QuizzesSection
              key={quizSessionKey}
              initialMode={quizPresetMode}
              initialArenaMode={quizPresetArenaMode}
              initialDomain={quizPresetDomain}
              autoStart={quizAutoStart}
              coachSessionId={coachSession.sessionId}
              quizSrs={progress.quizSrs}
              quizHistory={progress.quizHistory}
              arcadeStats={progress.arcade}
              studyProgress={progress}
              onRecordQuestionSrs={handleRecordQuestionSrs}
              onRecordAttempt={handleRecordQuizAttempt}
              onCompleteArcadeRun={handleCompleteArcadeRun}
              onClaimAchievement={handleClaimAchievement}
              onClaimAllAchievements={handleClaimAllAchievements}
              onNavigateSection={(sec) => handleNavigate(sec)}
              onContextChange={setActiveContext}
              onRequestHint={requestContextHint}
            />
          )}

          {activeSection === 'flashcards' && (
            <FlashcardsSection
              srsMap={progress.flashcardSrs}
              onGradeCard={handleGradeFlashcard}
              onResetDeck={handleResetFlashcardDeck}
              onContextChange={setActiveContext}
              onRequestHint={requestContextHint}
              onAskCoachCard={handleAskCoachFlashcard}
            />
          )}
        </Suspense>
      </main>

      <Suspense fallback={null}>
        <StudyCoachSheet
          isOpen={coachOpen}
          initialTab={coachTab}
          hintTriggerCount={hintTriggerCount}
          unreadUpdatesCount={unreadUpdatesCount}
          snapshot={progressSnapshot}
          sessionState={coachSession}
          cloudSyncStatus={cloudSync.status}
          lastSyncedAt={cloudSync.lastSyncedAt}
          isCloudSignedIn={Boolean(user && user.emailVerified)}
          pendingChatPrompt={pendingCoachPrompt}
          onConsumePendingChatPrompt={() => setPendingCoachPrompt(null)}
          onSyncNow={handleSyncNow}
          onUpdateSession={setCoachSession}
          onNewSession={handleNewCoachSession}
          onOpen={openCoach}
          onClose={() => setCoachOpen(false)}
          onNavigateAction={(sec, dom) => {
            if (sec === 'quizzes' && dom) {
              handleStartQuiz('drill', dom);
            } else {
              handleNavigate(sec, dom);
            }
          }}
        />
      </Suspense>

      <VoiceCommandControl onExecuteCommand={handleVoiceCommand} />

      <footer className="hidden md:block border-t border-slate-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>CloudPrep CLF-C02 · Independent AWS Certified Cloud Practitioner Study Companion</p>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-5">
            <button
              type="button"
              onClick={() => handleNavigate('services')}
              className="min-h-[44px] px-2 inline-flex items-center hover:text-slate-900 cursor-pointer"
            >
              Services
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('practice')}
              className="min-h-[44px] px-2 inline-flex items-center hover:text-slate-900 cursor-pointer"
            >
              Labs
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('quizzes')}
              className="min-h-[44px] px-2 inline-flex items-center hover:text-slate-900 cursor-pointer"
            >
              Quizzes
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('flashcards')}
              className="min-h-[44px] px-2 inline-flex items-center hover:text-slate-900 cursor-pointer"
            >
              Flashcards
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
