import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Flag,
  Lightbulb,
  Loader2,
  RotateCcw,
  Sparkles,
  Vibrate,
  Volume2,
  VolumeX,
  XCircle,
  Zap,
} from 'lucide-react';
import { EXAM_DOMAINS } from '../data/awsServices';
import { QUIZ_QUESTIONS } from '../data/quizQuestions';
import {
  ArcadeStats,
  DomainId,
  NavSection,
  QuizAttemptRecord,
  QuizQuestion,
  SrsItemState,
  StudyProgress,
} from '../data/types';
import {
  isSoundEnabled,
  playFailureSound,
  playNeutralTap,
  playQuizCompleteSound,
  playSuccessSound,
  setSoundEnabled,
  SOUND_PREF_EVENT,
} from '../utils/audio';
import {
  HAPTICS_PREF_EVENT,
  isHapticsEnabled,
  setHapticsEnabled,
  triggerCorrectHaptic,
  triggerIncorrectHaptic,
  triggerMilestoneHaptic,
  triggerSelectionHaptic,
} from '../utils/haptics';
import { ActiveStudyContext } from '../utils/coachProgress';
import { getOrCreateCoachSessionId } from '../utils/coachSession';
import {
  countUnseenQuestions,
  cryptoShuffle,
  fetchFreshAiQuestions,
  loadRecentAiStems,
  markQuestionsSeen,
  selectFreshQuestions,
  shuffleQuizQuestionOptions,
} from '../utils/questionFreshness';
import {
  formatDueStatus,
  getEarliestNextDueLabel,
  isItemDue,
  isItemScheduledFuture,
} from '../utils/spacedRepetition';
import { ArcadeBlitzArena, ArcadeMode, ArcadeRunResult } from './ArcadeBlitzArena';

export type QuizMode = 'drill' | 'practice' | 'mock' | 'srs' | 'blitz';

interface QuizzesSectionProps {
  initialMode?: QuizMode;
  initialArenaMode?: ArcadeMode;
  initialDomain?: DomainId | 'all';
  autoStart?: boolean;
  coachSessionId?: string;
  quizSrs: Record<string, SrsItemState>;
  quizHistory: QuizAttemptRecord[];
  arcadeStats: ArcadeStats;
  studyProgress: StudyProgress;
  onRecordQuestionSrs: (
    questionId: string,
    isCorrect: boolean,
    isEphemeral?: boolean
  ) => void;
  onRecordAttempt: (attempt: QuizAttemptRecord) => void;
  onCompleteArcadeRun: (result: ArcadeRunResult) => void;
  onClaimAchievement: (achievementId: string, xpReward: number, title: string) => void;
  onClaimAllAchievements: (items: { id: string; xpReward: number; title: string }[]) => void;
  onNavigateSection?: (section: NavSection) => void;
  onContextChange?: (ctx: ActiveStudyContext) => void;
  onRequestHint?: () => void;
}

export function QuizzesSection({
  initialMode = 'practice',
  initialArenaMode = 'blitz',
  initialDomain = 'all',
  autoStart = false,
  coachSessionId,
  quizSrs,
  quizHistory,
  arcadeStats,
  studyProgress,
  onRecordQuestionSrs,
  onRecordAttempt,
  onCompleteArcadeRun,
  onClaimAchievement,
  onClaimAllAchievements,
  onNavigateSection,
  onContextChange,
  onRequestHint,
}: QuizzesSectionProps) {
  const [phase, setPhase] = useState<'setup' | 'active' | 'results' | 'blitz'>(
    initialMode === 'blitz' && autoStart ? 'blitz' : 'setup'
  );
  const [arenaMode, setArenaMode] = useState<ArcadeMode>(initialArenaMode);
  const [mode, setMode] = useState<QuizMode>(initialMode);
  const [domainFilter, setDomainFilter] = useState<DomainId | 'all'>(initialDomain);
  const [freshDomain, setFreshDomain] = useState<DomainId | 'all'>('all');
  const [freshCount, setFreshCount] = useState<5 | 8>(5);
  const [isGeneratingFresh, setIsGeneratingFresh] = useState<boolean>(false);
  const [freshError, setFreshError] = useState<string | null>(null);
  const [isFreshAiSession, setIsFreshAiSession] = useState<boolean>(false);
  const [sessionQuestions, setSessionQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [soundOn, setSoundOn] = useState<boolean>(isSoundEnabled);
  const [hapticsOn, setHapticsOn] = useState<boolean>(isHapticsEnabled);
  const freshAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const onPrefChange = () => setSoundOn(isSoundEnabled());
    const onHapticsPrefChange = () => setHapticsOn(isHapticsEnabled());
    window.addEventListener(SOUND_PREF_EVENT, onPrefChange);
    window.addEventListener(HAPTICS_PREF_EVENT, onHapticsPrefChange);
    return () => {
      window.removeEventListener(SOUND_PREF_EVENT, onPrefChange);
      window.removeEventListener(HAPTICS_PREF_EVENT, onHapticsPrefChange);
    };
  }, []);

  useEffect(() => {
    return () => {
      freshAbortRef.current?.abort();
    };
  }, []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playNeutralTap();
  };

  const toggleHaptics = () => {
    const next = !hapticsOn;
    setHapticsOn(next);
    setHapticsEnabled(next);
    if (next) triggerSelectionHaptic();
  };

  const now = useMemo(() => new Date(), [quizSrs, phase]);
  const dueQuestions = useMemo(
    () => QUIZ_QUESTIONS.filter((q) => isItemDue(quizSrs[q.id], now)),
    [quizSrs, now]
  );
  const scheduledQuestionsCount = useMemo(
    () => QUIZ_QUESTIONS.filter((q) => isItemScheduledFuture(quizSrs[q.id], now)).length,
    [quizSrs, now]
  );
  const unseenBankCount = useMemo(
    () => countUnseenQuestions(QUIZ_QUESTIONS, quizSrs),
    [quizSrs, phase]
  );
  const earliestQuizDue = useMemo(
    () =>
      getEarliestNextDueLabel(
        quizSrs,
        QUIZ_QUESTIONS.map((q) => q.id),
        now
      ),
    [quizSrs, now]
  );

  const startSession = (chosenMode: QuizMode, chosenDomain: DomainId | 'all') => {
    const currentNow = new Date();
    let selected: QuizQuestion[] = [];

    if (chosenMode === 'srs') {
      // Prioritize overdue & previously missed questions first, then unseen questions
      const duePool = QUIZ_QUESTIONS.filter((q) => isItemDue(quizSrs[q.id], currentNow));
      const seenDue = duePool
        .filter((q) => Boolean(quizSrs[q.id]))
        .sort((a, b) => {
          const stA = quizSrs[a.id];
          const stB = quizSrs[b.id];
          if (stA.lapses !== stB.lapses) return stB.lapses - stA.lapses;
          return new Date(stA.dueAtIso).getTime() - new Date(stB.dueAtIso).getTime();
        });
      const unseenDue = cryptoShuffle(duePool.filter((q) => !quizSrs[q.id]));
      const prioritized = [...seenDue, ...unseenDue];

      if (prioritized.length > 0) {
        selected = prioritized.slice(0, 15).map(shuffleQuizQuestionOptions);
        markQuestionsSeen(selected.map((q) => q.id));
      } else {
        selected = selectFreshQuestions(QUIZ_QUESTIONS, 10, quizSrs);
      }
    } else {
      const pool =
        chosenDomain === 'all'
          ? QUIZ_QUESTIONS
          : QUIZ_QUESTIONS.filter((q) => q.domain === chosenDomain);
      const count =
        chosenMode === 'drill'
          ? Math.min(10, pool.length)
          : chosenMode === 'mock'
          ? pool.length
          : Math.min(20, pool.length);
      selected = selectFreshQuestions(pool, count, quizSrs);
    }

    setFreshError(null);
    setIsFreshAiSession(false);
    setMode(chosenMode);
    setDomainFilter(chosenDomain);
    setSessionQuestions(selected);
    setCurrentIdx(0);
    setAnswers({});
    setRevealed({});
    setFlagged({});
    setSecondsLeft(chosenMode === 'mock' ? selected.length * 80 : 0);
    setPhase('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGenerateFreshSet = async (
    targetDomain: DomainId | 'all' = freshDomain,
    targetCount: number = freshCount
  ) => {
    if (isGeneratingFresh) return;
    freshAbortRef.current?.abort();
    const controller = new AbortController();
    freshAbortRef.current = controller;

    setIsGeneratingFresh(true);
    setFreshError(null);
    triggerSelectionHaptic();

    try {
      const sessionId = coachSessionId || getOrCreateCoachSessionId();
      const recentBankStems = QUIZ_QUESTIONS.slice(0, 12).map((q) => q.question.slice(0, 110));
      const excludeStems = [...loadRecentAiStems(), ...recentBankStems];

      const freshQuestions = await fetchFreshAiQuestions({
        sessionId,
        domainFilter: targetDomain,
        count: targetCount,
        excludeStems,
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      setIsFreshAiSession(true);
      setMode('drill');
      setDomainFilter(targetDomain);
      setSessionQuestions(freshQuestions);
      setCurrentIdx(0);
      setAnswers({});
      setRevealed({});
      setFlagged({});
      setSecondsLeft(0);
      setPhase('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setFreshError(
        err instanceof Error
          ? err.message
          : 'Could not generate fresh questions right now. Please try again.'
      );
    } finally {
      if (freshAbortRef.current === controller) {
        freshAbortRef.current = null;
      }
      setIsGeneratingFresh(false);
    }
  };

  // Sync incoming external mode/domain jumps
  useEffect(() => {
    setMode(initialMode);
    setArenaMode(initialArenaMode);
    setDomainFilter(initialDomain);
    if (autoStart) {
      if (initialMode === 'blitz') {
        setPhase('blitz');
      } else {
        startSession(initialMode, initialDomain);
      }
    } else {
      setPhase('setup');
    }
  }, [initialMode, initialArenaMode, initialDomain, autoStart]);

  // Countdown timer during Mock Exam (runs continuously without tearing down interval each tick)
  useEffect(() => {
    if (phase !== 'active' || mode !== 'mock') return;

    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [phase, mode]);

  // Auto-submit Mock Exam when countdown reaches 00:00
  useEffect(() => {
    if (phase === 'active' && mode === 'mock' && secondsLeft === 0 && sessionQuestions.length > 0) {
      finishQuiz();
    }
  }, [phase, mode, secondsLeft, sessionQuestions.length]);

  const currentQuestion = sessionQuestions[currentIdx];

  useEffect(() => {
    if (phase === 'active' && currentQuestion) {
      const dom = EXAM_DOMAINS.find((d) => d.id === currentQuestion.domain)?.title;
      const answerRevealed = mode !== 'mock' && Boolean(revealed[currentQuestion.id]);
      onContextChange?.({
        type: 'quiz',
        title: currentQuestion.question,
        details: answerRevealed
          ? `Options: ${currentQuestion.options.join(' | ')}. Answer revealed. Official explanation: ${currentQuestion.explanation}`
          : `Options: ${currentQuestion.options.join(' | ')}. Mode: ${mode}${currentQuestion.multiSelect ? ' (Select TWO)' : ''}. Answer NOT yet revealed.`,
        domainTitle: dom,
        isAnswerVisible: answerRevealed,
      });
    }
  }, [phase, currentQuestion?.id, mode, revealed]);

  const toggleOption = (q: QuizQuestion, optionIdx: number) => {
    if (mode !== 'mock' && revealed[q.id]) return;

    triggerSelectionHaptic();
    setAnswers((prev) => {
      const existing = prev[q.id] || [];
      if (q.multiSelect) {
        if (existing.includes(optionIdx)) {
          return { ...prev, [q.id]: existing.filter((i) => i !== optionIdx) };
        }
        if (existing.length >= 2) {
          return { ...prev, [q.id]: [existing[1], optionIdx] };
        }
        return { ...prev, [q.id]: [...existing, optionIdx] };
      }
      return { ...prev, [q.id]: [optionIdx] };
    });
  };

  const isQuestionCorrect = (q: QuizQuestion): boolean => {
    const picked = [...(answers[q.id] || [])].sort();
    const expected = [...q.correctIndices].sort();
    return (
      picked.length === expected.length &&
      picked.every((val, i) => val === expected[i])
    );
  };

  const handleCheckPracticeQuestion = (q: QuizQuestion) => {
    if (revealed[q.id]) return;
    const correct = isQuestionCorrect(q);
    if (correct) {
      playSuccessSound();
      triggerCorrectHaptic();
    } else {
      playFailureSound();
      triggerIncorrectHaptic();
    }
    setRevealed((prev) => ({ ...prev, [q.id]: true }));
    onRecordQuestionSrs(q.id, correct, Boolean(q.isAiGenerated));
  };

  const finishQuiz = () => {
    const totalCount = sessionQuestions.length;
    const correctCount = sessionQuestions.filter((q) => isQuestionCorrect(q)).length;
    const scaledScore = Math.round(100 + (correctCount / Math.max(totalCount, 1)) * 900);

    playQuizCompleteSound(scaledScore >= 700);
    triggerMilestoneHaptic(scaledScore >= 700);

    // Update SM-2 schedule for canonical bank questions not yet individually checked (e.g. Mock Exam)
    sessionQuestions.forEach((q) => {
      const hasAnswered = (answers[q.id] || []).length > 0;
      if (hasAnswered && !revealed[q.id]) {
        onRecordQuestionSrs(q.id, isQuestionCorrect(q), Boolean(q.isAiGenerated));
      }
    });

    onRecordAttempt({
      id: `${Date.now()}`,
      dateIso: new Date().toISOString(),
      mode,
      domainFilter,
      correctCount,
      totalCount,
      scaledScore,
    });

    setPhase('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Keyboard shortcuts during active quiz (1-4 / A-D to select option, Enter to check or step next)
  useEffect(() => {
    if (phase !== 'active' || !currentQuestion) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      const key = e.key.toLowerCase();
      let idx: number | null = null;
      if (key === '1' || key === 'a') idx = 0;
      else if (key === '2' || key === 'b') idx = 1;
      else if (key === '3' || key === 'c') idx = 2;
      else if (key === '4' || key === 'd') idx = 3;

      if (idx !== null && idx < currentQuestion.options.length) {
        e.preventDefault();
        toggleOption(currentQuestion, idx);
        return;
      }

      if (e.key === 'Enter') {
        const pickedLen = (answers[currentQuestion.id] || []).length;
        const alreadyRevealed = mode !== 'mock' && Boolean(revealed[currentQuestion.id]);
        if (mode !== 'mock' && !alreadyRevealed && pickedLen > 0) {
          e.preventDefault();
          handleCheckPracticeQuestion(currentQuestion);
        } else if (currentIdx < sessionQuestions.length - 1) {
          e.preventDefault();
          setCurrentIdx((i) => Math.min(sessionQuestions.length - 1, i + 1));
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, currentQuestion, mode, answers, revealed, currentIdx, sessionQuestions.length]);

  const startMissedDrill = (missedQuestions: QuizQuestion[]) => {
    if (missedQuestions.length === 0) return;
    triggerSelectionHaptic();
    setMode('drill');
    setSessionQuestions(cryptoShuffle(missedQuestions).map(shuffleQuizQuestionOptions));
    setCurrentIdx(0);
    setAnswers({});
    setRevealed({});
    setFlagged({});
    setSecondsLeft(0);
    setPhase('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const domainStats = useMemo(() => {
    return EXAM_DOMAINS.map((d) => {
      const qs = sessionQuestions.filter((q) => q.domain === d.id);
      const correct = qs.filter((q) => isQuestionCorrect(q)).length;
      return { domain: d, total: qs.length, correct };
    }).filter((item) => item.total > 0);
  }, [sessionQuestions, answers]);

  if (phase === 'blitz') {
    return (
      <ArcadeBlitzArena
        initialMode={arenaMode}
        autoStart={autoStart && initialMode === 'blitz'}
        arcadeStats={arcadeStats}
        studyProgress={studyProgress}
        onRecordQuestionSrs={onRecordQuestionSrs}
        onCompleteRun={onCompleteArcadeRun}
        onClaimAchievement={onClaimAchievement}
        onClaimAllAchievements={onClaimAllAchievements}
        onNavigateSection={onNavigateSection}
        onExitArena={() => setPhase('setup')}
      />
    );
  }

  // PHASE 1: SETUP SCREEN
  if (phase === 'setup') {
    return (
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
              CLF-C02 Practice Quizzes & Arcade Blitz
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
              Every quiz answer updates your SM-2 retention schedule and earns Cloud Rank XP.
              Jump into 60-second Cloud Blitz for rapid streaks or run a timed exam simulation.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums text-slate-600">
            <span>
              Unseen Fresh: <strong className="text-slate-900">{unseenBankCount}</strong>
            </span>
            <span>
              Due: <strong className="text-[#C2410C]">{dueQuestions.length}</strong>
            </span>
            <span>
              Scheduled: <strong className="text-emerald-700">{scheduledQuestionsCount}</strong>
            </span>
            <button
              type="button"
              onClick={toggleHaptics}
              aria-pressed={hapticsOn}
              aria-label={hapticsOn ? 'Disable haptic feedback' : 'Enable haptic feedback'}
              className="inline-flex items-center gap-1.5 px-2.5 min-h-[38px] font-sans font-semibold text-xs border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
            >
              <Vibrate
                className={`w-3.5 h-3.5 ${hapticsOn ? 'text-[#C2410C]' : 'text-slate-400'}`}
                aria-hidden="true"
              />
              {hapticsOn ? 'Haptics On' : 'Haptics Off'}
            </button>
            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundOn ? 'Mute sound effects' : 'Enable sound effects'}
              className="inline-flex items-center gap-1.5 px-2.5 min-h-[38px] font-sans font-semibold text-xs border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
            >
              {soundOn ? (
                <Volume2 className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              )}
              {soundOn ? 'Sound On' : 'Muted'}
            </button>
          </div>
        </div>

        {/* Featured Arcade Arena Mode Banner */}
        <div className="bg-slate-900 text-white border border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <p className="text-xs font-mono text-amber-400 font-semibold tabular-nums">
              Arcade Mode · Best Blitz: {arcadeStats.bestBlitzScore.toLocaleString()} pts · Max Combo:{' '}
              {arcadeStats.longestCombo}x
            </p>
            <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400 shrink-0" aria-hidden="true" />
              Cloud Blitz & 3-Heart Survival
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl">
              High-tempo 60-second sprint or 3-life survival waves across single-select questions
              and Shared Responsibility tasks with 4x combo multipliers and speed bonuses.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5 w-full md:w-auto shrink-0">
            <button
              type="button"
              onClick={() => {
                setArenaMode('daily');
                setPhase('blitz');
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 min-h-[48px] text-sm font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              Daily 5 Challenge
            </button>
            <button
              type="button"
              onClick={() => {
                setArenaMode('blitz');
                setPhase('blitz');
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 min-h-[48px] text-sm font-bold bg-[#C2410C] hover:bg-[#9A3412] active:scale-[0.98] text-white rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Zap className="w-4 h-4" aria-hidden="true" />
              Play Cloud Blitz
            </button>
          </div>
        </div>

        {/* Live Fresh AI Question Generator */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-mono text-[#C2410C] font-semibold">
                Live Question Engine · Zero Repeats · Options Auto-Shuffled
              </p>
              <h2 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#C2410C] shrink-0" aria-hidden="true" />
                Generate Brand-New CLF-C02 Questions
              </h2>
              <p className="text-sm text-slate-600 max-w-2xl">
                Create net-new AWS scenario questions tailored to any exam domain—excluded from your
                recent question history so every set tests fresh reasoning.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
              <label htmlFor="fresh-domain-select" className="sr-only">
                Fresh Question Target Domain
              </label>
              <select
                id="fresh-domain-select"
                value={freshDomain}
                onChange={(e) => setFreshDomain(e.target.value as DomainId | 'all')}
                disabled={isGeneratingFresh}
                className="px-3 min-h-[44px] text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-[#C2410C] disabled:opacity-60"
              >
                <option value="all">All Domains (Mixed)</option>
                {EXAM_DOMAINS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.number}. {d.title}
                  </option>
                ))}
              </select>

              <div
                role="group"
                aria-label="Fresh question count"
                className="grid grid-cols-2 border border-slate-200 rounded-lg overflow-hidden bg-slate-50 shrink-0"
              >
                {([5, 8] as const).map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    disabled={isGeneratingFresh}
                    onClick={() => setFreshCount(cnt)}
                    className={`px-3 min-h-[44px] text-xs font-mono font-semibold tabular-nums cursor-pointer transition-colors ${
                      freshCount === cnt
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {cnt} Qs
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={isGeneratingFresh}
                onClick={() => void handleGenerateFreshSet(freshDomain, freshCount)}
                className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] text-sm font-semibold bg-[#C2410C] hover:bg-[#9A3412] active:scale-[0.98] disabled:opacity-70 text-white rounded-lg transition-all cursor-pointer whitespace-nowrap"
              >
                {isGeneratingFresh ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    Generating {freshCount} Fresh Qs...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" aria-hidden="true" />
                    Generate Fresh Set
                  </>
                )}
              </button>
            </div>
          </div>

          {freshError && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900"
            >
              <span className="inline-flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" aria-hidden="true" />
                {freshError}
              </span>
              <button
                type="button"
                onClick={() => void handleGenerateFreshSet(freshDomain, freshCount)}
                className="px-3 min-h-[34px] font-semibold bg-white border border-rose-200 rounded-md text-rose-800 hover:bg-rose-100 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Card 1: Spaced Repetition Review */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-6">
            <div>
              <p className="text-xs font-mono text-[#C2410C] font-semibold tabular-nums">
                {dueQuestions.length > 0
                  ? `${dueQuestions.length} Due / Unseen`
                  : `Queue Clear · Next ${earliestQuizDue || 'Soon'}`}
              </p>
              <h2 className="mt-1.5 font-display text-lg font-bold text-slate-900">
                Spaced Review Queue
              </h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Prioritizes missed and overdue questions before introducing unseen ones, maximizing
                retention per minute spent.
              </p>
            </div>

            <button
              type="button"
              onClick={() => startSession('srs', 'all')}
              className="w-full min-h-[46px] px-4 text-sm font-semibold bg-[#C2410C] hover:bg-[#9A3412] text-white rounded-lg transition-colors cursor-pointer"
            >
              {dueQuestions.length > 0
                ? `Review Due (${Math.min(15, dueQuestions.length)})`
                : 'Extra Practice (10 Qs)'}
            </button>
          </div>

          {/* Card 2: Quick Domain Drill */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col justify-between space-y-6">
            <div>
              <p className="text-xs font-mono text-slate-500 font-semibold">10 Questions · Untimed</p>
              <h2 className="mt-1.5 font-display text-lg font-bold text-slate-900">
                Quick Domain Drill
              </h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Target a specific CLF-C02 domain with immediate answer checking and distractor notes.
              </p>

              <div className="mt-4">
                <label htmlFor="drill-domain" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Target Domain
                </label>
                <select
                  id="drill-domain"
                  value={domainFilter}
                  onChange={(e) => setDomainFilter(e.target.value as DomainId | 'all')}
                  className="w-full px-3 min-h-[44px] text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-[#C2410C]"
                >
                  <option value="all">All Domains (Mixed 10)</option>
                  {EXAM_DOMAINS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.number}. {d.title} ({d.weight}%)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => startSession('drill', domainFilter)}
              className="w-full min-h-[46px] px-4 text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors cursor-pointer"
            >
              Start Domain Drill
            </button>
          </div>

          {/* Card 3: Guided Practice Set */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col justify-between space-y-6">
            <div>
              <p className="text-xs font-mono text-slate-500 font-semibold">20 Questions · Untimed</p>
              <h2 className="mt-1.5 font-display text-lg font-bold text-slate-900">
                Guided Practice Mode
              </h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Mixed-domain study session across Compute, Security, Storage, and Billing with
                instant explanations.
              </p>
            </div>

            <button
              type="button"
              onClick={() => startSession('practice', 'all')}
              className="w-full min-h-[46px] px-4 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-lg transition-colors cursor-pointer"
            >
              Start 20-Question Practice
            </button>
          </div>

          {/* Card 4: Timed Mock Exam */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col justify-between space-y-6">
            <div>
              <p className="text-xs font-mono text-slate-500 font-semibold">
                Full Bank ({QUIZ_QUESTIONS.length} Qs) · Timed
              </p>
              <h2 className="mt-1.5 font-display text-lg font-bold text-slate-900">
                CLF-C02 Exam Simulation
              </h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Countdown clock, question flagging grid, and a 100–1000 scaled score report (700+
                passing threshold).
              </p>
            </div>

            <button
              type="button"
              onClick={() => startSession('mock', 'all')}
              className="w-full min-h-[46px] px-4 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-lg transition-colors cursor-pointer"
            >
              Start Timed Simulation
            </button>
          </div>
        </div>

        {/* Recent Quiz Attempts */}
        {quizHistory.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="font-display text-base font-bold text-slate-900 mb-4">
              Recent Quiz History
            </h2>
            <div className="divide-y divide-slate-100 text-sm">
              {quizHistory
                .slice(-5)
                .reverse()
                .map((att) => (
                  <div
                    key={att.id}
                    className="py-3 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div>
                      <span className="font-semibold text-slate-900 capitalize">
                        {att.mode === 'mock'
                          ? 'Exam Simulation'
                          : att.mode === 'srs'
                          ? 'Spaced Review Session'
                          : att.mode === 'blitz'
                          ? 'Cloud Blitz Arcade'
                          : `${att.mode} Session`}
                      </span>
                      <span className="ml-2 text-xs text-slate-500">
                        · {new Date(att.dateIso).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 font-mono tabular-nums text-xs">
                      <span className="text-slate-600">
                        {att.correctCount} / {att.totalCount} correct
                      </span>
                      <span
                        className={`font-bold ${
                          att.scaledScore >= 700 ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {att.scaledScore} / 1000 ({att.scaledScore >= 700 ? 'PASS' : 'REVIEW'})
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // PHASE 3: RESULTS & FULL REVIEW
  if (phase === 'results') {
    const totalCount = sessionQuestions.length;
    const missedQuestions = sessionQuestions.filter((q) => !isQuestionCorrect(q));
    const correctCount = totalCount - missedQuestions.length;
    const scaledScore = Math.round(100 + (correctCount / Math.max(totalCount, 1)) * 900);
    const passed = scaledScore >= 700;

    return (
      <div className="space-y-8">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <p className="text-xs font-medium text-slate-500">
              {isFreshAiSession
                ? 'Live Fresh AI Set · Scenario Practice Report'
                : 'CLF-C02 Score Report · SM-2 Review Intervals Updated'}
            </p>
            <h1 className="mt-1.5 font-display text-3xl font-bold text-slate-900 tabular-nums">
              Scaled Score: {scaledScore} / 1000
              <span
                className={`ml-3 text-base font-semibold ${
                  passed ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {passed ? 'PASS' : 'NEEDS REVIEW'}
              </span>
            </h1>
            <p className="mt-2 text-sm text-slate-600 tabular-nums">
              You answered {correctCount} out of {totalCount} questions correctly (
              {Math.round((correctCount / Math.max(totalCount, 1)) * 100)}%).{' '}
              {isFreshAiSession
                ? 'Generate another fresh batch anytime or re-drill missed scenarios.'
                : 'Incorrect items are queued for immediate review.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {missedQuestions.length > 0 && (
              <button
                type="button"
                onClick={() => startMissedDrill(missedQuestions)}
                className="inline-flex items-center gap-2 px-4 min-h-[44px] text-sm font-semibold bg-[#C2410C] hover:bg-[#9A3412] text-white rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Zap className="w-4 h-4" aria-hidden="true" />
                Re-Drill Missed ({missedQuestions.length})
              </button>
            )}
            <button
              type="button"
              disabled={isGeneratingFresh}
              onClick={() => void handleGenerateFreshSet(domainFilter, freshCount)}
              className="inline-flex items-center gap-2 px-4 min-h-[44px] text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-900 rounded-lg cursor-pointer whitespace-nowrap"
            >
              {isGeneratingFresh ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#C2410C]" aria-hidden="true" />
              ) : (
                <Sparkles className="w-4 h-4 text-[#C2410C]" aria-hidden="true" />
              )}
              {isGeneratingFresh ? 'Generating...' : 'New Fresh AI Set'}
            </button>
            <button
              type="button"
              onClick={() => setPhase('setup')}
              className="inline-flex items-center gap-2 px-4 min-h-[44px] text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Quiz Hub
            </button>
          </div>
        </div>

        {freshError && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900"
          >
            <span className="inline-flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" aria-hidden="true" />
              {freshError}
            </span>
          </div>
        )}

        {/* Domain Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {domainStats.map(({ domain, total, correct }) => {
            const pct = Math.round((correct / total) * 100);
            return (
              <div key={domain.id} className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-xs text-slate-500 font-mono">
                  Domain {domain.number} · {domain.weight}% weight
                </p>
                <p className="mt-1 font-display text-sm font-bold text-slate-900">
                  {domain.title}
                </p>
                <p className="mt-3 font-mono text-xl font-bold text-slate-900 tabular-nums">
                  {correct}/{total}{' '}
                  <span className="text-xs font-normal text-slate-500">({pct}%)</span>
                </p>
              </div>
            );
          })}
        </div>

        {/* Question-by-Question Review */}
        <div className="space-y-4">
          <h2 className="font-display text-lg font-bold text-slate-900">
            {isFreshAiSession
              ? 'Question-by-Question Review'
              : 'Question-by-Question Review & Updated SRS Schedule'}
          </h2>
          {sessionQuestions.map((q, idx) => {
            const right = isQuestionCorrect(q);
            const picked = answers[q.id] || [];
            const qSrs = quizSrs[q.id];
            return (
              <div
                key={q.id}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-mono text-slate-500 tabular-nums">
                      {q.isAiGenerated
                        ? 'Live Fresh Question · Instant XP'
                        : formatDueStatus(qSrs, new Date())}
                    </p>
                    <p className="text-sm font-semibold text-slate-900">
                      <span className="font-mono text-slate-500 mr-2">Q{idx + 1}.</span>
                      {q.question}
                    </p>
                  </div>
                  {right ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 shrink-0">
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                      Correct
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 shrink-0">
                      <XCircle className="w-4 h-4" aria-hidden="true" />
                      Incorrect
                    </span>
                  )}
                </div>

                <div className="text-xs space-y-1 text-slate-600">
                  <p>
                    <strong className="text-slate-800">Your answer: </strong>
                    {picked.length > 0
                      ? picked.map((i) => q.options[i]).join('; ')
                      : 'Unanswered'}
                  </p>
                  <p>
                    <strong className="text-emerald-800">Correct answer: </strong>
                    {q.correctIndices.map((i) => q.options[i]).join('; ')}
                  </p>
                </div>

                <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-lg leading-relaxed">
                  {q.explanation}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // PHASE 2: ACTIVE QUIZ WORKSPACE
  const pickedForCurrent = answers[currentQuestion.id] || [];
  const isRevealed = mode !== 'mock' && Boolean(revealed[currentQuestion.id]);
  const currentCorrect = isQuestionCorrect(currentQuestion);
  const currentSrs = quizSrs[currentQuestion.id];
  const answeredCount = sessionQuestions.filter(
    (q) => (answers[q.id] || []).length > 0
  ).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Main Question Stage */}
      <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 sm:p-8 space-y-5 sm:space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
          <div className="text-xs text-slate-500">
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              Q{currentIdx + 1}/{sessionQuestions.length}
            </span>
            <span className="mx-1.5">·</span>
            <span>{EXAM_DOMAINS.find((d) => d.id === currentQuestion.domain)?.title}</span>
            {currentQuestion.isAiGenerated && (
              <>
                <span className="mx-1.5">·</span>
                <span className="inline-flex items-center gap-1 font-semibold text-[#C2410C]">
                  <Sparkles className="w-3 h-3" aria-hidden="true" />
                  Live Fresh
                </span>
              </>
            )}
            {currentQuestion.multiSelect && (
              <>
                <span className="mx-1.5">·</span>
                <span className="font-semibold text-[#C2410C]">Select TWO</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {mode === 'mock' && (
              <span className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums font-semibold text-slate-800 mr-1">
                <Clock className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
                {formatTimer(secondsLeft)}
              </span>
            )}
            <button
              type="button"
              onClick={() => setMobileNavOpen((o) => !o)}
              className="lg:hidden inline-flex items-center gap-1 px-2.5 min-h-[40px] text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-700 cursor-pointer font-mono tabular-nums"
            >
              Map ({answeredCount}/{sessionQuestions.length})
            </button>
            {onRequestHint && (
              <button
                type="button"
                onClick={onRequestHint}
                className="inline-flex items-center gap-1.5 px-3 min-h-[40px] text-xs font-semibold rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-[#C2410C] transition-colors cursor-pointer"
              >
                <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
                Hint
              </button>
            )}
            <button
              type="button"
              onClick={toggleHaptics}
              aria-pressed={hapticsOn}
              aria-label={hapticsOn ? 'Disable haptic feedback' : 'Enable haptic feedback'}
              className="inline-flex items-center justify-center min-w-[40px] min-h-[40px] rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
            >
              <Vibrate
                className={`w-4 h-4 ${hapticsOn ? 'text-[#C2410C]' : 'text-slate-400'}`}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundOn ? 'Mute sound effects' : 'Enable sound effects'}
              className="inline-flex items-center justify-center min-w-[40px] min-h-[40px] rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
            >
              {soundOn ? (
                <Volume2 className="w-4 h-4 text-[#C2410C]" aria-hidden="true" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() =>
                setFlagged((prev) => ({
                  ...prev,
                  [currentQuestion.id]: !prev[currentQuestion.id],
                }))
              }
              className={`inline-flex items-center gap-1.5 px-3 min-h-[40px] text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                flagged[currentQuestion.id]
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
            >
              <Flag className="w-3.5 h-3.5" aria-hidden="true" />
              {flagged[currentQuestion.id] ? 'Flagged' : 'Flag'}
            </button>
          </div>
        </div>

        {/* Collapsible Mobile Question Navigator Drawer */}
        {mobileNavOpen && (
          <div className="lg:hidden p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="font-semibold text-slate-900">Jump to Question</span>
              <button
                type="button"
                onClick={() => setPhase('setup')}
                className="font-semibold text-rose-700 px-2 py-1 cursor-pointer"
              >
                Exit Quiz
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {sessionQuestions.map((q, idx) => {
                const isCurrent = idx === currentIdx;
                const isAnswered = (answers[q.id] || []).length > 0;
                const isFlagged = Boolean(flagged[q.id]);

                let cellStyle = 'bg-white border-slate-200 text-slate-700';
                if (isCurrent) {
                  cellStyle = 'bg-slate-900 border-slate-900 text-white';
                } else if (isFlagged) {
                  cellStyle = 'bg-amber-50 border-amber-300 text-amber-900';
                } else if (isAnswered) {
                  cellStyle = 'bg-emerald-50 border-emerald-300 text-emerald-900';
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setCurrentIdx(idx);
                      setMobileNavOpen(false);
                    }}
                    className={`min-h-[42px] text-xs font-mono tabular-nums font-semibold rounded-lg border cursor-pointer ${cellStyle}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-mono text-slate-500 tabular-nums">
            {currentQuestion.isAiGenerated
              ? 'Live Fresh Question · Options Shuffled'
              : formatDueStatus(currentSrs, new Date())}
          </p>
          <h2 className="font-display text-base sm:text-xl font-bold text-slate-900 leading-snug">
            {currentQuestion.question}
          </h2>
        </div>

        <div className="space-y-3">
          {currentQuestion.options.map((optText, optIdx) => {
            const selected = pickedForCurrent.includes(optIdx);
            const isAnswer = currentQuestion.correctIndices.includes(optIdx);

            let optClass =
              'border-slate-200 bg-white hover:border-slate-300 text-slate-800';
            if (isRevealed) {
              if (isAnswer) {
                optClass = 'border-emerald-400 bg-emerald-50 text-emerald-950';
              } else if (selected && !isAnswer) {
                optClass = 'border-rose-300 bg-rose-50 text-rose-950';
              }
            } else if (selected) {
              optClass = 'border-[#C2410C] bg-amber-50/70 text-slate-900';
            }

            return (
              <button
                key={optText}
                type="button"
                onClick={() => toggleOption(currentQuestion, optIdx)}
                className={`w-full text-left p-4 min-h-[54px] rounded-xl border transition-all active:scale-[0.99] cursor-pointer flex items-start gap-3 ${optClass}`}
              >
                <span className="font-mono text-xs font-bold mt-0.5 shrink-0">
                  {String.fromCharCode(65 + optIdx)}.
                </span>
                <span className="text-sm leading-relaxed flex-1">{optText}</span>
              </button>
            );
          })}
        </div>

        {/* Practice Mode Immediate Explanation + Updated SM-2 Interval */}
        {isRevealed && (
          <div
            className={`p-4 rounded-xl border text-sm space-y-2 ${
              currentCorrect
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-rose-50 border-rose-200 text-rose-950'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-display font-bold text-xs">
                {currentCorrect ? 'Correct Answer' : 'Review Explanation'}
              </p>
              <span className="font-mono text-xs tabular-nums opacity-85">
                {currentQuestion.isAiGenerated
                  ? currentCorrect
                    ? '+25 XP Earned'
                    : 'Fresh Practice Review'
                  : formatDueStatus(currentSrs, new Date())}
              </span>
            </div>
            <p className="leading-relaxed">{currentQuestion.explanation}</p>
            {currentQuestion.distractorNotes.length > 0 && (
              <ul className="pt-1 text-xs space-y-1 opacity-90 list-disc list-inside">
                {currentQuestion.distractorNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Thumb-Friendly Controls Footer */}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            <button
              type="button"
              disabled={currentIdx === 0}
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              className="px-4 min-h-[44px] text-xs font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={currentIdx === sessionQuestions.length - 1}
              onClick={() =>
                setCurrentIdx((i) => Math.min(sessionQuestions.length - 1, i + 1))
              }
              className="px-4 min-h-[44px] text-xs font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            {mode !== 'mock' && !isRevealed && (
              <button
                type="button"
                disabled={pickedForCurrent.length === 0}
                onClick={() => handleCheckPracticeQuestion(currentQuestion)}
                className="px-4 min-h-[46px] text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                Check Answer
              </button>
            )}
            <button
              type="button"
              onClick={finishQuiz}
              className={`px-4 min-h-[46px] text-xs font-semibold bg-[#C2410C] hover:bg-[#9A3412] text-white rounded-lg cursor-pointer ${
                mode === 'mock' || isRevealed ? 'col-span-2 sm:col-span-1' : ''
              }`}
            >
              Finish & Score
            </button>
          </div>
        </div>
      </div>

      {/* Desktop Right Question Navigator Grid */}
      <aside className="hidden lg:block lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-display font-bold text-slate-900">Question Navigator</span>
          <span className="font-mono tabular-nums text-slate-500">
            {answeredCount}/{sessionQuestions.length} answered
          </span>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {sessionQuestions.map((q, idx) => {
            const isCurrent = idx === currentIdx;
            const isAnswered = (answers[q.id] || []).length > 0;
            const isFlagged = Boolean(flagged[q.id]);

            let cellStyle = 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100';
            if (isCurrent) {
              cellStyle = 'bg-slate-900 border-slate-900 text-white';
            } else if (isFlagged) {
              cellStyle = 'bg-amber-50 border-amber-300 text-amber-900';
            } else if (isAnswered) {
              cellStyle = 'bg-emerald-50 border-emerald-300 text-emerald-900';
            }

            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setCurrentIdx(idx)}
                className={`h-9 text-xs font-mono tabular-nums font-semibold rounded-lg border transition-colors cursor-pointer ${cellStyle}`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Amber = Flagged · Green = Answered</span>
          <button
            type="button"
            onClick={() => setPhase('setup')}
            className="text-slate-700 hover:text-slate-900 font-semibold cursor-pointer"
          >
            Exit
          </button>
        </div>
      </aside>
    </div>
  );
}
