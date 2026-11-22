import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Cloud,
  Download,
  Flame,
  Layers,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Target,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AWS_SERVICES, EXAM_DOMAINS, WELL_ARCHITECTED_PILLARS } from '../data/awsServices';
import { FLASHCARDS } from '../data/flashcards';
import { PRACTICE_SCENARIOS } from '../data/practiceScenarios';
import { QUIZ_QUESTIONS } from '../data/quizQuestions';
import { DomainId, NavSection, StudyProgress } from '../data/types';
import {
  computeExamReadiness,
  DAILY_CHALLENGE_BONUS_XP,
  DAILY_XP_GOAL,
  getCloudRank,
  getDailyChallengeStatus,
  getEffectiveDailyXp,
  getEffectiveStreakDays,
  getLocalDateKey,
} from '../utils/arcade';
import { triggerSelectionHaptic } from '../utils/haptics';
import { isItemDue } from '../utils/spacedRepetition';
import { AchievementsDisplay } from './AchievementsDisplay';
import { ActivityChart } from './ActivityChart';
import { PWAInstallButton } from './PWAInstallButton';
import { QuizMode } from './QuizzesSection';

export interface CloudSyncInfo {
  status: 'local' | 'connecting' | 'syncing' | 'synced' | 'error';
  error: string | null;
  lastSyncedAt: string | null;
}

interface OverviewSectionProps {
  progress: StudyProgress;
  cloudSync: CloudSyncInfo;
  onRetrySync: () => void;
  onSyncNow: () => void;
  onNavigate: (section: NavSection, domain?: DomainId) => void;
  onStartQuiz: (mode: QuizMode, domain?: DomainId | 'all') => void;
  onStartDailyChallenge: () => void;
  onOpenCoachBriefing: () => void;
  onResetProgress: () => void;
  onClaimAchievement: (achievementId: string, xpReward: number, title: string) => void;
  onClaimAllAchievements: (items: { id: string; xpReward: number; title: string }[]) => void;
}

export function OverviewSection({
  progress,
  cloudSync,
  onRetrySync,
  onSyncNow,
  onNavigate,
  onStartQuiz,
  onStartDailyChallenge,
  onOpenCoachBriefing,
  onResetProgress,
  onClaimAchievement,
  onClaimAllAchievements,
}: OverviewSectionProps) {
  const {
    user,
    isEmailVerified,
    isAuthReady,
    isSigningIn,
    authError,
    signInWithGoogle,
    signOutUser,
    clearAuthError,
  } = useAuth();
  const [heroImgError, setHeroImgError] = useState(false);
  const [avatarImgError, setAvatarImgError] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [editingExamDate, setEditingExamDate] = useState(false);

  const examDateStorageKey = `cloudprep_exam_target_date_v1_${user?.uid || 'guest'}`;
  const [examTargetDate, setExamTargetDate] = useState<string>(() => {
    try {
      const saved = window.localStorage.getItem(
        `cloudprep_exam_target_date_v1_${user?.uid || 'guest'}`
      );
      return saved && /^\d{4}-\d{2}-\d{2}$/.test(saved) ? saved : '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    setAvatarImgError(false);
    setConfirmSignOut(false);
    try {
      const saved = window.localStorage.getItem(examDateStorageKey);
      setExamTargetDate(saved && /^\d{4}-\d{2}-\d{2}$/.test(saved) ? saved : '');
    } catch {
      setExamTargetDate('');
    }
  }, [examDateStorageKey]);

  const handleSaveExamDate = (nextDate: string) => {
    triggerSelectionHaptic();
    const clean = /^\d{4}-\d{2}-\d{2}$/.test(nextDate) ? nextDate : '';
    setExamTargetDate(clean);
    setEditingExamDate(false);
    try {
      if (clean) {
        window.localStorage.setItem(examDateStorageKey, clean);
      } else {
        window.localStorage.removeItem(examDateStorageKey);
      }
    } catch {
      // Ignore storage quota issues gracefully
    }
  };

  const handleExportProgressBackup = () => {
    triggerSelectionHaptic();
    try {
      const dateKey = getLocalDateKey();
      const payload = {
        exportedAt: new Date().toISOString(),
        app: 'CloudPrep CLF-C02',
        account: user?.email || 'local',
        examTargetDate: examTargetDate || null,
        progress,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cloudprep-clf-c02-backup-${dateKey}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Ignore browser download restrictions gracefully
    }
  };

  const now = useMemo(() => new Date(), [progress]);
  const dueFlashcardsCount = FLASHCARDS.filter((c) =>
    isItemDue(progress.flashcardSrs[c.id], now)
  ).length;
  const dueQuizCount = QUIZ_QUESTIONS.filter((q) =>
    isItemDue(progress.quizSrs[q.id], now)
  ).length;
  const longTermCardsCount = FLASHCARDS.filter(
    (c) => (progress.flashcardSrs[c.id]?.intervalDays ?? 0) >= 6
  ).length;

  const latestQuiz =
    progress.quizHistory.length > 0
      ? progress.quizHistory[progress.quizHistory.length - 1]
      : null;

  const bestScore =
    progress.quizHistory.length > 0
      ? Math.max(...progress.quizHistory.map((q) => q.scaledScore))
      : null;

  const rank = getCloudRank(progress.arcade?.xp ?? 0);
  const dailyXp = getEffectiveDailyXp(progress.arcade);
  const dailyGoalPct = Math.min(100, Math.round((dailyXp / DAILY_XP_GOAL) * 100));
  const streakDays = getEffectiveStreakDays(progress.arcade);
  const readiness = useMemo(() => computeExamReadiness(progress), [progress]);
  const dailyChallenge = useMemo(
    () => getDailyChallengeStatus(progress.arcade),
    [progress.arcade]
  );

  const lastSyncedLabel = useMemo(() => {
    if (!cloudSync.lastSyncedAt) return null;
    try {
      return new Date(cloudSync.lastSyncedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return null;
    }
  }, [cloudSync.lastSyncedAt]);

  const userInitial = useMemo(() => {
    const label = user?.displayName || user?.email || 'U';
    return label.trim().charAt(0).toUpperCase() || 'U';
  }, [user?.displayName, user?.email]);

  // Pick weakest domain by recorded quiz accuracy or weighted readiness
  const weakestDomain = useMemo(() => {
    const scored = EXAM_DOMAINS.map((d) => {
      const qs = QUIZ_QUESTIONS.filter((q) => q.domain === d.id);
      let attempts = 0;
      let corrects = 0;
      qs.forEach((q) => {
        const st = progress.quizSrs[q.id];
        if (st) {
          attempts += st.attemptCount;
          corrects += st.correctCount;
        }
      });
      const acc = attempts > 0 ? Math.round((corrects / attempts) * 100) : null;
      return { domain: d, acc };
    });
    scored.sort((a, b) => {
      if (a.acc !== null && b.acc !== null) return a.acc - b.acc;
      if (a.acc !== null) return -1;
      if (b.acc !== null) return 1;
      return b.domain.weight - a.domain.weight;
    });
    return scored[0];
  }, [progress.quizSrs]);

  const gaugeRadius = 46;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const forecastRatio = Math.max(0.04, Math.min(1, (readiness.scaledForecast - 100) / 900));
  const gaugeDashOffset = gaugeCircumference * (1 - forecastRatio);

  const todayDateKey = getLocalDateKey();
  const examCountdown = useMemo(() => {
    if (!examTargetDate) return null;
    const todayMs = new Date(`${todayDateKey}T00:00:00`).getTime();
    const targetMs = new Date(`${examTargetDate}T00:00:00`).getTime();
    if (!Number.isFinite(todayMs) || !Number.isFinite(targetMs)) return null;
    const diffDays = Math.ceil((targetMs - todayMs) / (24 * 60 * 60 * 1000));
    const effectiveDays = Math.max(1, diffDays);
    const questionsPerDay = Math.max(5, Math.ceil(Math.max(dueQuizCount, 10) / effectiveDays));
    const cardsPerDay = Math.max(5, Math.ceil(Math.max(dueFlashcardsCount, 10) / effectiveDays));
    const formattedDate = new Date(`${examTargetDate}T12:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    return {
      diffDays,
      formattedDate,
      questionsPerDay,
      cardsPerDay,
    };
  }, [examTargetDate, todayDateKey, dueQuizCount, dueFlashcardsCount]);

  return (
    <div className="space-y-8 sm:space-y-12">
      {/* Pro Account & Cloud Firestore Sync Bar */}
      <section
        aria-label="Account and cloud sync"
        className="bg-white border border-slate-200 rounded-2xl px-4 sm:px-6 py-3.5 space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {!isAuthReady ? (
            <div className="flex items-center gap-2.5 text-xs text-slate-500 min-h-[44px]">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" aria-hidden="true" />
              <span>Verifying Google Cloud session...</span>
            </div>
          ) : user ? (
            <>
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="relative shrink-0">
                  {user.photoURL && !avatarImgError ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName ? `${user.displayName} avatar` : 'User avatar'}
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarImgError(true)}
                      className="w-10 h-10 rounded-full object-cover ring-1 ring-slate-200"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="w-10 h-10 rounded-full bg-slate-900 text-white text-sm font-bold flex items-center justify-center ring-1 ring-slate-200"
                    >
                      {userInitial}
                    </div>
                  )}
                  {isEmailVerified && cloudSync.status === 'synced' && (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white flex items-center justify-center shadow-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    </span>
                  )}
                </div>

                <div className="min-w-0 space-y-0.5">
                  <p className="font-display text-sm font-bold text-slate-900 truncate">
                    {user.displayName || 'Google Account'}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                    {user.email && (
                      <span className="truncate max-w-full sm:max-w-[260px]">
                        {user.email}
                      </span>
                    )}
                    {!isEmailVerified ? (
                      <span className="inline-flex items-center gap-1 font-medium text-amber-800">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" />
                        Verify email to enable Cloud Sync
                      </span>
                    ) : cloudSync.status === 'error' ? (
                      <span className="inline-flex items-center gap-1 font-medium text-rose-700">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-hidden="true" />
                        Sync paused
                      </span>
                    ) : cloudSync.status === 'connecting' || cloudSync.status === 'syncing' ? (
                      <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                        <Loader2 className="w-3 h-3 animate-spin text-[#C2410C] shrink-0" aria-hidden="true" />
                        {cloudSync.status === 'connecting' ? 'Connecting...' : 'Syncing...'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-700 tabular-nums">
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        Cloud Synced{lastSyncedLabel ? ` ${lastSyncedLabel}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                {isEmailVerified && (
                  <button
                    type="button"
                    disabled={cloudSync.status === 'connecting' || cloudSync.status === 'syncing'}
                    onClick={() => {
                      triggerSelectionHaptic();
                      if (cloudSync.status === 'error') {
                        onRetrySync();
                      } else {
                        onSyncNow();
                      }
                    }}
                    aria-label="Sync progress to Cloud Firestore now"
                    className={`inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[44px] text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 ${
                      cloudSync.status === 'error'
                        ? 'text-white bg-[#C2410C] hover:bg-[#9A3412] focus-visible:outline-[#C2410C]'
                        : 'text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 focus-visible:outline-slate-900'
                    }`}
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        cloudSync.status === 'connecting' || cloudSync.status === 'syncing'
                          ? 'animate-spin text-[#C2410C]'
                          : ''
                      }`}
                      aria-hidden="true"
                    />
                    {cloudSync.status === 'error' ? 'Retry Sync' : 'Sync'}
                  </button>
                )}

                {confirmSignOut ? (
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        triggerSelectionHaptic();
                        setConfirmSignOut(false);
                        void signOutUser();
                      }}
                      className="inline-flex items-center justify-center px-3.5 min-h-[44px] text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                    >
                      Confirm Sign Out
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmSignOut(false)}
                      className="inline-flex items-center justify-center px-3 min-h-[44px] text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      triggerSelectionHaptic();
                      setConfirmSignOut(true);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[44px] text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                  >
                    <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                    Sign out
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
                  <Cloud className="w-4 h-4 text-[#C2410C]" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    Cloud Progress & Exam Sync
                  </p>
                  <p className="text-xs text-slate-600">
                    Studying locally · Sign in with Google to back up XP, SM-2 decks, and quiz history across devices.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => void signInWithGoogle()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 min-h-[44px] text-xs font-semibold text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C]"
              >
                {isSigningIn ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#C2410C]" aria-hidden="true" />
                ) : (
                  <LogIn className="w-4 h-4 text-[#C2410C]" aria-hidden="true" />
                )}
                {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
              </button>
            </>
          )}
        </div>

        {(authError || cloudSync.error) && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" aria-hidden="true" />
              <span>{authError || cloudSync.error}</span>
            </div>
            {authError && (
              <button
                type="button"
                onClick={clearAuthError}
                className="min-h-[44px] px-2.5 text-xs font-semibold text-rose-900 hover:underline cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            )}
          </div>
        )}
      </section>

      {/* Hero Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
        <div className="lg:col-span-7 flex flex-col justify-between bg-white border border-slate-200 rounded-xl p-5 sm:p-8 lg:p-10">
          <div>
            <p className="text-xs font-medium text-slate-500">
              AWS Certified Cloud Practitioner · Exam Code CLF-C02 · Pass 700/1000
            </p>
            <h1 className="mt-3 sm:mt-4 font-display text-2xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-slate-900 leading-[1.15] text-balance">
              Master AWS cloud concepts, core services, and exam scenarios
            </h1>
            <p className="mt-3.5 sm:mt-5 text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
              An interactive study workspace built directly around the four official CLF-C02 domains.
              Review service trade-offs, test architectural decisions in hands-on labs, drill domain
              quizzes with spaced repetition, and retain high-yield facts with SM-2 flashcards.
            </p>
          </div>

          <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => onStartQuiz('blitz', 'all')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 min-h-[46px] text-sm font-semibold text-white bg-[#C2410C] hover:bg-[#9A3412] active:scale-[0.99] rounded-lg transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C]"
            >
              <Zap className="w-4 h-4" aria-hidden="true" />
              Play 60s Cloud Blitz
            </button>

            <button
              type="button"
              onClick={() => onStartQuiz('srs', 'all')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 min-h-[46px] text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 active:scale-[0.99] rounded-lg transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              Spaced Review ({dueQuizCount} due)
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('flashcards')}
              className="w-full sm:w-auto text-center min-h-[44px] text-sm font-semibold text-slate-700 hover:text-[#C2410C] transition-colors whitespace-nowrap shrink-0 cursor-pointer px-3 py-2 tabular-nums"
            >
              Flashcards ({dueFlashcardsCount} due)
            </button>
          </div>
        </div>

        {/* Visual Architectural Illustration */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="relative flex-1 min-h-[180px] sm:min-h-[240px] bg-slate-100">
            {!heroImgError ? (
              <img
                src="/src/assets/images/hero_cloud_architecture_1795132762859.jpg"
                alt="Isometric architectural illustration of modular cloud server racks and distributed storage nodes"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgError(true)}
                className="w-full h-full lg:h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700">
                <Cloud className="w-12 h-12 text-[#C2410C] mb-3" aria-hidden="true" />
                <p className="font-display font-semibold text-sm text-center">
                  AWS Global Cloud Infrastructure Blueprint
                </p>
              </div>
            )}
          </div>
          <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between gap-4 text-xs text-slate-600">
            <span>
              Level {rank.level} · <strong className="text-slate-900">{rank.title}</strong>
            </span>
            <span className="font-mono tabular-nums font-medium text-slate-900">
              {rank.currentXp.toLocaleString()} XP · {QUIZ_QUESTIONS.length} Qs
            </span>
          </div>
        </div>
      </section>

      {/* Actionable 3-Card Arcade & Study Missions Strip */}
      <section aria-labelledby="missions-heading" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <h2 id="missions-heading" className="sr-only">
          Recommended Next Actions
        </h2>

        <button
          type="button"
          onClick={onStartDailyChallenge}
          className="text-left bg-slate-900 text-white border border-slate-800 hover:border-sky-400/70 active:scale-[0.99] rounded-xl p-5 transition-all cursor-pointer flex flex-col justify-between gap-4 min-h-[124px]"
        >
          <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums">
            <span className="text-sky-300 font-semibold">Today&apos;s Daily 5</span>
            <span className={dailyChallenge.completed ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
              {dailyChallenge.completed
                ? `Cleared · ${dailyChallenge.correctCount}/${dailyChallenge.totalCount}`
                : `+${DAILY_CHALLENGE_BONUS_XP} XP Bonus`}
            </span>
          </div>
          <div>
            <p className="font-display text-base font-bold text-white flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-sky-400 shrink-0" aria-hidden="true" />
              {dailyChallenge.completed ? 'Replay Daily 5 Sprint' : 'Complete Today\u2019s Daily 5'}
            </p>
            <p className="mt-1 text-xs text-slate-300">
              {dailyChallenge.completed
                ? `Today\u2019s best: ${dailyChallenge.bestScore.toLocaleString()} pts. Keep your streak sharp.`
                : '5 rapid multi-domain CLF-C02 rounds with 4.5s speed bonuses.'}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('flashcards')}
          className="text-left bg-white border border-slate-200 hover:border-[#C2410C] active:scale-[0.99] rounded-xl p-5 transition-all cursor-pointer flex flex-col justify-between gap-4 min-h-[124px]"
        >
          <div className="flex items-center justify-between gap-2 text-xs font-mono text-[#C2410C] tabular-nums">
            <span>SM-2 Memory Deck</span>
            <span>{dueFlashcardsCount} due now</span>
          </div>
          <div>
            <p className="font-display text-base font-bold text-slate-900">
              Clear Due Flashcards
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Swipe cards to lock high-yield AWS limits and pricing rules for 6+ days.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onStartQuiz('drill', weakestDomain.domain.id)}
          className="text-left bg-white border border-slate-200 hover:border-slate-400 active:scale-[0.99] rounded-xl p-5 transition-all cursor-pointer flex flex-col justify-between gap-4 min-h-[124px]"
        >
          <div className="flex items-center justify-between gap-2 text-xs font-mono text-slate-500 tabular-nums">
            <span>Domain {weakestDomain.domain.number} · {weakestDomain.domain.weight}% weight</span>
            <span>
              {weakestDomain.acc !== null ? `${weakestDomain.acc}% acc` : 'Priority target'}
            </span>
          </div>
          <div>
            <p className="font-display text-base font-bold text-slate-900">
              Drill {weakestDomain.domain.title}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              10 targeted questions to raise your lowest-scoring exam domain.
            </p>
          </div>
        </button>
      </section>

      {/* Weighted CLF-C02 Exam Readiness Forecast */}
      <section
        aria-labelledby="readiness-heading"
        className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          <div className="lg:col-span-5 flex items-center gap-5">
            <div className="relative w-28 h-28 shrink-0">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112" aria-hidden="true">
                <circle
                  cx="56"
                  cy="56"
                  r={gaugeRadius}
                  fill="none"
                  stroke="#E2E8F0"
                  strokeWidth="10"
                />
                <circle
                  cx="56"
                  cy="56"
                  r={gaugeRadius}
                  fill="none"
                  stroke={readiness.isPassingForecast ? '#059669' : '#C2410C'}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={gaugeCircumference}
                  strokeDashoffset={gaugeDashOffset}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-mono text-xl font-bold text-slate-900 tabular-nums leading-none">
                  {readiness.scaledForecast}
                </span>
                <span className="mt-1 text-[10px] font-mono text-slate-500 tabular-nums">
                  / 1000
                </span>
              </div>
            </div>

            <div className="space-y-1.5 min-w-0">
              <div className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold">
                {readiness.isPassingForecast ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                ) : (
                  <Target className="w-4 h-4 text-[#C2410C] shrink-0" aria-hidden="true" />
                )}
                <span className={readiness.isPassingForecast ? 'text-emerald-700' : 'text-[#C2410C]'}>
                  {readiness.statusLabel}
                </span>
              </div>
              <h2 id="readiness-heading" className="font-display text-lg sm:text-xl font-bold text-slate-900">
                CLF-C02 Exam Forecast
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed tabular-nums">
                {readiness.isPassingForecast
                  ? `Forecast clears the 700/1000 passing bar (${readiness.coveragePct}% syllabus coverage).`
                  : `${readiness.deltaToPass} pts below the 700 passing threshold · ${readiness.coveragePct}% syllabus covered.`}
              </p>

              {/* Exam Target Date & Daily Pace Planner */}
              <div className="pt-2">
                {editingExamDate ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="exam-target-date" className="sr-only">
                      Target CLF-C02 Exam Date
                    </label>
                    <input
                      id="exam-target-date"
                      type="date"
                      min={todayDateKey}
                      value={examTargetDate}
                      onChange={(e) => handleSaveExamDate(e.target.value)}
                      className="px-3 min-h-[44px] text-base sm:text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#C2410C]"
                    />
                    {examTargetDate && (
                      <button
                        type="button"
                        onClick={() => handleSaveExamDate('')}
                        className="px-3 min-h-[44px] text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingExamDate(false)}
                      aria-label="Close exam date editor"
                      className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer shrink-0"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : examCountdown ? (
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-900 tabular-nums">
                      <Calendar className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
                      {examCountdown.diffDays > 0
                        ? `${examCountdown.diffDays}d to exam (${examCountdown.formattedDate})`
                        : examCountdown.diffDays === 0
                        ? `Exam Day (${examCountdown.formattedDate})`
                        : `Target passed (${examCountdown.formattedDate})`}
                    </span>
                    <span className="text-slate-500 font-mono tabular-nums">
                      · Pace: {examCountdown.questionsPerDay} Qs + {examCountdown.cardsPerDay} cards/day
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingExamDate(true)}
                      className="min-h-[44px] px-1.5 inline-flex items-center font-semibold text-[#C2410C] hover:underline cursor-pointer"
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingExamDate(true)}
                    className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-semibold text-[#C2410C] hover:underline cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                    Set CLF-C02 exam target date
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {readiness.domains.map((dom) => (
              <div
                key={dom.domainId}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-900 truncate">
                    D{dom.number}. {dom.title}
                  </span>
                  <span className="font-mono font-semibold text-slate-700 tabular-nums shrink-0">
                    {dom.masteryPct}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      dom.masteryPct >= 70
                        ? 'bg-emerald-600'
                        : dom.masteryPct >= 35
                        ? 'bg-[#C2410C]'
                        : 'bg-slate-400'
                    }`}
                    style={{ width: `${dom.masteryPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 tabular-nums">
                  <span>{dom.weight}% exam weight</span>
                  <button
                    type="button"
                    onClick={() => onStartQuiz('drill', dom.domainId)}
                    className="min-h-[36px] px-1 -mr-1 inline-flex items-center font-sans font-semibold text-[#C2410C] hover:underline cursor-pointer"
                  >
                    Drill D{dom.number}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4-Column CLF-C02 Exam Domain Mastery Strip */}
      <section aria-labelledby="domains-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-4 mb-5">
          <div>
            <h2 id="domains-heading" className="font-display text-xl font-bold text-slate-900">
              Official CLF-C02 Exam Domains
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Click any domain to jump directly into targeted service guides or a domain quiz drill.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            Total Weight: 100%
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {EXAM_DOMAINS.map((domain) => {
            const domainCards = FLASHCARDS.filter((f) => f.domain === domain.id);
            const domainScheduled = domainCards.filter(
              (f) => !isItemDue(progress.flashcardSrs[f.id], now)
            ).length;

            return (
              <div
                key={domain.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between hover:border-slate-300 transition-colors"
              >
                <div>
                  <div className="flex items-baseline justify-between gap-2 text-xs text-slate-500">
                    <span className="font-mono font-medium text-[#C2410C]">
                      Domain {domain.number}
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {domain.weight}% of exam
                    </span>
                  </div>
                  <h3 className="mt-2 font-display text-base font-bold text-slate-900">
                    {domain.title}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    {domain.summary}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 tabular-nums">
                    <span>Retention Queue Cleared</span>
                    <span className="font-mono font-medium text-slate-800">
                      {domainScheduled} / {domainCards.length}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#C2410C] transition-all duration-200"
                      style={{
                        width: `${domainCards.length ? (domainScheduled / domainCards.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between pt-1 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => onNavigate('services', domain.id)}
                      className="min-h-[44px] inline-flex items-center text-slate-700 hover:text-[#C2410C] transition-colors cursor-pointer"
                    >
                      Study Guide
                    </button>
                    <button
                      type="button"
                      onClick={() => onStartQuiz('drill', domain.id)}
                      className="min-h-[44px] inline-flex items-center text-[#C2410C] hover:text-[#9A3412] transition-colors cursor-pointer"
                    >
                      Quiz Domain
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Personal Study Progress & Spaced Repetition Queue */}
      <section aria-labelledby="progress-heading" className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <h2 id="progress-heading" className="font-display text-lg font-bold text-slate-900">
              Spaced Repetition & Study Progress
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Items answered correctly advance across expanding SM-2 intervals; missed items return
              immediately.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PWAInstallButton />
            <button
              type="button"
              onClick={handleExportProgressBackup}
              className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Export Backup
            </button>
            <button
              type="button"
              onClick={onOpenCoachBriefing}
              className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Get Coach Briefing
            </button>
            {confirmReset ? (
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onResetProgress();
                    setConfirmReset(false);
                  }}
                  className="inline-flex items-center px-3 min-h-[44px] text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Confirm Reset
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="inline-flex items-center px-3 min-h-[44px] text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Cloud Rank XP, Daily Streak & Daily Goal Bar */}
        <div className="py-5 border-b border-slate-100 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div className="lg:col-span-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-[#C2410C] shrink-0">
              <Trophy className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-mono tabular-nums">
                Level {rank.level} · {rank.currentXp.toLocaleString()} / {rank.nextLevelXp.toLocaleString()} XP
              </p>
              <p className="font-display text-sm font-bold text-slate-900">{rank.title}</p>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-1.5">
            <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-600">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
                <Flame className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
                Streak: {streakDays}d
              </span>
              <span>
                Daily Goal: {dailyXp}/{DAILY_XP_GOAL} XP
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  dailyXp >= DAILY_XP_GOAL ? 'bg-emerald-600' : 'bg-[#C2410C]'
                }`}
                style={{ width: `${dailyGoalPct}%` }}
              />
            </div>
          </div>

          <div className="lg:col-span-3 space-y-1.5">
            <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500">
              <span>Combo: {progress.arcade?.longestCombo ?? 0}x</span>
              <span>Blitz: {(progress.arcade?.bestBlitzScore ?? 0).toLocaleString()}</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-slate-800 transition-all duration-300"
                style={{ width: `${rank.progressPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-6">
          <div>
            <p className="text-xs text-slate-500">Due Flashcards</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {dueFlashcardsCount}
              <span className="text-sm font-normal text-slate-400"> / {FLASHCARDS.length}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {longTermCardsCount} long-term (6d+)
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Due Quiz Questions</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {dueQuizCount}
              <span className="text-sm font-normal text-slate-400">
                {' '}
                / {QUIZ_QUESTIONS.length}
              </span>
            </p>
            <button
              type="button"
              onClick={() => onStartQuiz('srs', 'all')}
              className="mt-1 text-xs font-semibold text-[#C2410C] hover:underline cursor-pointer"
            >
              Launch review queue
            </button>
          </div>
          <div>
            <p className="text-xs text-slate-500">Services & Labs Completed</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {progress.reviewedServices.length + progress.completedScenarios.length}
              <span className="text-sm font-normal text-slate-400">
                {' '}
                / {AWS_SERVICES.length + PRACTICE_SCENARIOS.length}
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {progress.reviewedServices.length} services · {progress.completedScenarios.length}{' '}
              labs
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Best Scaled Quiz Score</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {bestScore !== null ? bestScore : '—'}
              <span className="text-sm font-normal text-slate-400">
                {bestScore !== null ? ' / 1000' : ' No attempts'}
              </span>
            </p>
            {latestQuiz && (
              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                Latest: {latestQuiz.correctCount}/{latestQuiz.totalCount} correct
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 7-Day Activity & Goal Tracker Chart */}
      <ActivityChart arcade={progress.arcade} />

      {/* Dedicated Achievements & Milestone Trophy Cabinet */}
      <AchievementsDisplay
        progress={progress}
        onClaimReward={onClaimAchievement}
        onClaimAllRewards={onClaimAllAchievements}
        onNavigateAction={(section) => onNavigate(section)}
      />

      {/* AWS Well-Architected Framework 6 Pillars */}
      <section aria-labelledby="waf-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-4 mb-5">
          <div>
            <h2 id="waf-heading" className="font-display text-xl font-bold text-slate-900">
              AWS Well-Architected Framework
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Six foundational design pillars tested frequently across Domain 1 and Domain 3 scenarios.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('practice')}
            className="min-h-[44px] inline-flex items-center gap-1.5 text-sm font-semibold text-[#C2410C] hover:text-[#9A3412] cursor-pointer"
          >
            <Layers className="w-4 h-4" aria-hidden="true" />
            Apply in Practice Labs
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {WELL_ARCHITECTED_PILLARS.map((pillar, idx) => (
            <div
              key={pillar.name}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-mono tabular-nums">0{idx + 1}</span>
                  <span>Well-Architected Pillar</span>
                </div>
                <h3 className="mt-2 font-display text-base font-bold text-slate-900">
                  {pillar.name}
                </h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{pillar.focus}</p>
              </div>
              <p className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
                <span className="font-semibold text-slate-700">Key practices: </span>
                {pillar.practices}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Study Checklist */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <h2 className="font-display text-lg font-bold text-slate-900">
            Ready to test exam readiness?
          </h2>
          <p className="text-sm text-slate-600 max-w-2xl">
            Take the full CLF-C02 exam simulation with question flagging, a countdown timer, and a
            domain-weighted scaled score report (700/1000 passing standard).
          </p>
        </div>
        <button
          type="button"
          onClick={() => onStartQuiz('mock', 'all')}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 min-h-[46px] text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
          Launch Exam Simulation
        </button>
      </section>
    </div>
  );
}
