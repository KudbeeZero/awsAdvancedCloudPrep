import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Flame,
  Heart,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Vibrate,
  Volume2,
  VolumeX,
  XCircle,
  Zap,
} from 'lucide-react';
import { EXAM_DOMAINS, SHARED_RESPONSIBILITY_TASKS } from '../data/awsServices';
import { QUIZ_QUESTIONS } from '../data/quizQuestions';
import { ArcadeStats, DomainId, NavSection, StudyProgress } from '../data/types';
import {
  calculateArcadePoints,
  DAILY_CHALLENGE_BONUS_XP,
  DAILY_CHALLENGE_COUNT,
  getComboMultiplier,
  getDailyChallengeSeed,
  getDailyChallengeStatus,
  getLocalDateKey,
  getNextMultiplierHint,
} from '../utils/arcade';
import {
  cryptoShuffle,
  loadRecentQuestionIds,
  markQuestionsSeen,
} from '../utils/questionFreshness';
import {
  isSoundEnabled,
  playArcadeStartSound,
  playComboSuccessSound,
  playFailureSound,
  playNeutralTap,
  playQuizCompleteSound,
  playTickSound,
  setSoundEnabled,
  SOUND_PREF_EVENT,
} from '../utils/audio';
import {
  HAPTICS_PREF_EVENT,
  isHapticsEnabled,
  setHapticsEnabled,
  triggerComboHaptic,
  triggerIncorrectHaptic,
  triggerMilestoneHaptic,
  triggerSelectionHaptic,
} from '../utils/haptics';
import { AchievementsDisplay } from './AchievementsDisplay';

export type ArcadeMode = 'blitz' | 'survival' | 'daily';
type GameState = 'TITLE_MENU' | 'PLAYING' | 'GAME_OVER';

interface ArcadeCard {
  id: string;
  sourceKind: 'quiz' | 'shared';
  domainTitle: string;
  prompt: string;
  options: string[];
  correctIdx: number;
  quickNote: string;
}

interface MissedRoundItem {
  id: string;
  prompt: string;
  yourPick: string;
  correctAnswer: string;
  quickNote: string;
}

export interface ArcadeRunResult {
  mode: ArcadeMode;
  score: number;
  xpEarned: number;
  correctCount: number;
  totalAnswered: number;
  maxCombo: number;
}

interface ArcadeBlitzArenaProps {
  initialMode?: ArcadeMode;
  autoStart?: boolean;
  arcadeStats: ArcadeStats;
  studyProgress: StudyProgress;
  onRecordQuestionSrs: (questionId: string, isCorrect: boolean) => void;
  onCompleteRun: (result: ArcadeRunResult) => void;
  onClaimAchievement: (achievementId: string, xpReward: number, title: string) => void;
  onClaimAllAchievements: (items: { id: string; xpReward: number; title: string }[]) => void;
  onNavigateSection?: (section: NavSection) => void;
  onExitArena: () => void;
}

const BLITZ_DURATION_SEC = 60;
const MAX_HEARTS = 3;
const SPEED_BONUS_MS = 4500;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDeck<T>(items: T[], rng: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function shuffleArcadeCardOptions(card: ArcadeCard): ArcadeCard {
  if (card.sourceKind !== 'quiz' || card.options.length <= 1) {
    return card;
  }
  const indices = cryptoShuffle(Array.from({ length: card.options.length }, (_, i) => i));
  const newCorrectIdx = indices.indexOf(card.correctIdx);
  if (newCorrectIdx < 0) return card;
  return {
    ...card,
    options: indices.map((oldIdx) => card.options[oldIdx]),
    correctIdx: newCorrectIdx,
  };
}

function buildFreshArcadeDeck(domainFilter: DomainId | 'all'): ArcadeCard[] {
  const pool = buildArcadePool(domainFilter);
  const recentIds = loadRecentQuestionIds();
  const recencyIndex = new Map<string, number>();
  recentIds.forEach((id, idx) => recencyIndex.set(id, idx));

  const fresh: ArcadeCard[] = [];
  const seen: { card: ArcadeCard; recency: number }[] = [];

  for (const card of pool) {
    const recency = recencyIndex.get(card.id);
    if (recency === undefined) {
      fresh.push(card);
    } else {
      seen.push({ card, recency });
    }
  }

  seen.sort((a, b) => a.recency - b.recency);
  return [...cryptoShuffle(fresh), ...seen.map((s) => s.card)].map(shuffleArcadeCardOptions);
}

function buildArcadePool(domainFilter: DomainId | 'all'): ArcadeCard[] {
  const domainMap = new Map(EXAM_DOMAINS.map((d) => [d.id, d.title]));

  const quizCards: ArcadeCard[] = QUIZ_QUESTIONS.filter(
    (q) => !q.multiSelect && (domainFilter === 'all' || q.domain === domainFilter)
  ).map((q) => ({
    id: q.id,
    sourceKind: 'quiz',
    domainTitle: domainMap.get(q.domain) || 'CLF-C02',
    prompt: q.question,
    options: q.options,
    correctIdx: q.correctIndices[0],
    quickNote: q.explanation,
  }));

  const sharedCards: ArcadeCard[] =
    domainFilter === 'all' || domainFilter === 'domain-2'
      ? SHARED_RESPONSIBILITY_TASKS.map((t) => ({
          id: t.id,
          sourceKind: 'shared',
          domainTitle: 'Shared Responsibility',
          prompt: `Who is responsible for: ${t.task}? (${t.context})`,
          options: ['AWS', 'Customer', 'Shared'],
          correctIdx: t.owner === 'AWS' ? 0 : t.owner === 'Customer' ? 1 : 2,
          quickNote: t.explanation,
        }))
      : [];

  return [...quizCards, ...sharedCards];
}

function buildDailyChallengeDeck(dateKey: string): ArcadeCard[] {
  const rng = mulberry32(getDailyChallengeSeed(dateKey));
  const pool = shuffleDeck(buildArcadePool('all'), rng);
  const picked: ArcadeCard[] = [];
  const usedDomains = new Set<string>();

  for (const card of pool) {
    if (picked.length >= DAILY_CHALLENGE_COUNT) break;
    if (!usedDomains.has(card.domainTitle)) {
      usedDomains.add(card.domainTitle);
      picked.push(card);
    }
  }
  for (const card of pool) {
    if (picked.length >= DAILY_CHALLENGE_COUNT) break;
    if (!picked.some((p) => p.id === card.id)) {
      picked.push(card);
    }
  }
  return picked;
}

export function ArcadeBlitzArena({
  initialMode = 'blitz',
  autoStart = false,
  arcadeStats,
  studyProgress,
  onRecordQuestionSrs,
  onCompleteRun,
  onClaimAchievement,
  onClaimAllAchievements,
  onNavigateSection,
  onExitArena,
}: ArcadeBlitzArenaProps) {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [arcadeMode, setArcadeMode] = useState<ArcadeMode>(initialMode);
  const [domainFilter, setDomainFilter] = useState<DomainId | 'all'>('all');
  const [deck, setDeck] = useState<ArcadeCard[]>([]);
  const [cardIdx, setCardIdx] = useState(0);

  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalAnswered, setTotalAnswered] = useState(0);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [secondsLeft, setSecondsLeft] = useState(BLITZ_DURATION_SEC);
  const [speedWindowRatio, setSpeedWindowRatio] = useState(1);

  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [roundFeedback, setRoundFeedback] = useState<{
    correct: boolean;
    points: number;
    speedBonus: boolean;
    note: string;
  } | null>(null);
  const [missedRounds, setMissedRounds] = useState<MissedRoundItem[]>([]);
  const [showMissedReview, setShowMissedReview] = useState<boolean>(false);
  const [isNewRecord, setIsNewRecord] = useState<boolean>(false);
  const [earnedDailyBonus, setEarnedDailyBonus] = useState<boolean>(false);
  const [soundOn, setSoundOn] = useState<boolean>(isSoundEnabled);
  const [hapticsOn, setHapticsOn] = useState<boolean>(isHapticsEnabled);

  const cardShownAtRef = useRef<number>(Date.now());
  const advanceTimerRef = useRef<number | null>(null);
  const runReportedRef = useRef<boolean>(false);
  const previousBestRef = useRef<number>(0);
  const hadDailyClearBeforeRunRef = useRef<boolean>(false);
  const autoStartedRef = useRef<boolean>(false);

  const scoreRef = useRef(0);
  const maxComboRef = useRef(0);
  const correctRef = useRef(0);
  const totalRef = useRef(0);

  useEffect(() => {
    scoreRef.current = score;
    maxComboRef.current = maxCombo;
    correctRef.current = correctCount;
    totalRef.current = totalAnswered;
  }, [score, maxCombo, correctCount, totalAnswered]);

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

  const clearAdvanceTimer = () => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearAdvanceTimer();
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

  const finalizeRun = useCallback(
    (
      finalScore: number,
      finalCorrect: number,
      finalTotal: number,
      finalMaxCombo: number,
      chosenMode: ArcadeMode
    ) => {
      if (runReportedRef.current) return;
      runReportedRef.current = true;
      clearAdvanceTimer();

      const xpEarned = Math.max(
        finalCorrect > 0 ? 15 : 0,
        Math.round(finalScore / 10)
      );

      let beatBest = false;
      if (chosenMode === 'blitz') {
        beatBest = finalScore > previousBestRef.current && finalScore > 0;
      } else if (chosenMode === 'survival') {
        beatBest = finalCorrect > previousBestRef.current && finalCorrect > 0;
      } else if (chosenMode === 'daily') {
        beatBest = !hadDailyClearBeforeRunRef.current || finalScore > previousBestRef.current;
        setEarnedDailyBonus(!hadDailyClearBeforeRunRef.current);
      }

      setIsNewRecord(beatBest);
      playQuizCompleteSound(finalCorrect >= (chosenMode === 'daily' ? 3 : 5));
      triggerMilestoneHaptic(finalCorrect >= (chosenMode === 'daily' ? 3 : 5) || beatBest);
      setGameState('GAME_OVER');

      onCompleteRun({
        mode: chosenMode,
        score: finalScore,
        xpEarned,
        correctCount: finalCorrect,
        totalAnswered: finalTotal,
        maxCombo: finalMaxCombo,
      });
    },
    [onCompleteRun]
  );

  const startRound = useCallback(
    (chosenMode: ArcadeMode = arcadeMode) => {
      clearAdvanceTimer();
      const todayKey = getLocalDateKey();
      const dailyStatus = getDailyChallengeStatus(arcadeStats, todayKey);

      const pool =
        chosenMode === 'daily'
          ? buildDailyChallengeDeck(todayKey)
          : buildFreshArcadeDeck(domainFilter);

      runReportedRef.current = false;
      hadDailyClearBeforeRunRef.current = dailyStatus.completed;
      previousBestRef.current =
        chosenMode === 'blitz'
          ? arcadeStats.bestBlitzScore
          : chosenMode === 'survival'
          ? arcadeStats.bestSurvivalStreak
          : dailyStatus.bestScore;

      setArcadeMode(chosenMode);
      setDeck(pool);
      setCardIdx(0);
      setScore(0);
      setCombo(0);
      setMaxCombo(0);
      setCorrectCount(0);
      setTotalAnswered(0);
      setHearts(MAX_HEARTS);
      setSecondsLeft(BLITZ_DURATION_SEC);
      setSpeedWindowRatio(1);
      setPickedIdx(null);
      setRoundFeedback(null);
      setMissedRounds([]);
      setShowMissedReview(false);
      setIsNewRecord(false);
      setEarnedDailyBonus(false);

      scoreRef.current = 0;
      maxComboRef.current = 0;
      correctRef.current = 0;
      totalRef.current = 0;
      cardShownAtRef.current = Date.now();

      playArcadeStartSound();
      triggerSelectionHaptic();
      setGameState('PLAYING');
    },
    [arcadeMode, domainFilter, arcadeStats]
  );

  useEffect(() => {
    if (autoStart && !autoStartedRef.current) {
      autoStartedRef.current = true;
      startRound(initialMode);
    }
  }, [autoStart, initialMode, startRound]);

  // Smooth 4.5s Speed Bonus meter during active play (before option picked)
  useEffect(() => {
    if (gameState !== 'PLAYING' || pickedIdx !== null) return;

    let rafId = 0;
    const tick = () => {
      const elapsed = Date.now() - cardShownAtRef.current;
      const ratio = Math.max(0, 1 - elapsed / SPEED_BONUS_MS);
      setSpeedWindowRatio(ratio);
      if (ratio > 0) {
        rafId = window.requestAnimationFrame(tick);
      }
    };
    rafId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(rafId);
  }, [gameState, pickedIdx, cardIdx]);

  // Blitz 60-second countdown timer
  useEffect(() => {
    if (gameState !== 'PLAYING' || arcadeMode !== 'blitz') return;

    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          return 0;
        }
        if (prev <= 6) {
          playTickSound();
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [gameState, arcadeMode]);

  useEffect(() => {
    if (gameState === 'PLAYING' && arcadeMode === 'blitz' && secondsLeft === 0) {
      finalizeRun(
        scoreRef.current,
        correctRef.current,
        totalRef.current,
        maxComboRef.current,
        'blitz'
      );
    }
  }, [gameState, arcadeMode, secondsLeft, finalizeRun]);

  const currentCard = deck[cardIdx % Math.max(deck.length, 1)];

  const stepToNextCard = useCallback(() => {
    clearAdvanceTimer();
    if (arcadeMode === 'daily' && totalRef.current >= DAILY_CHALLENGE_COUNT) {
      finalizeRun(
        scoreRef.current,
        correctRef.current,
        totalRef.current,
        maxComboRef.current,
        'daily'
      );
      return;
    }

    setPickedIdx(null);
    setRoundFeedback(null);
    setSpeedWindowRatio(1);
    cardShownAtRef.current = Date.now();
    setCardIdx((prev) => {
      if (prev + 1 >= deck.length) {
        setDeck((d) => shuffleDeck(d));
        return 0;
      }
      return prev + 1;
    });
  }, [arcadeMode, deck.length, finalizeRun]);

  const handleSelectOption = useCallback(
    (optIdx: number) => {
      if (gameState !== 'PLAYING' || pickedIdx !== null || !currentCard) return;

      const elapsedMs = Date.now() - cardShownAtRef.current;
      const isCorrect = optIdx === currentCard.correctIdx;
      const speedBonus = isCorrect && elapsedMs <= SPEED_BONUS_MS;

      setPickedIdx(optIdx);
      const nextTotal = totalAnswered + 1;
      setTotalAnswered(nextTotal);
      totalRef.current = nextTotal;

      markQuestionsSeen([currentCard.id]);
      if (currentCard.sourceKind === 'quiz') {
        onRecordQuestionSrs(currentCard.id, isCorrect);
      }

      if (isCorrect) {
        const nextCombo = combo + 1;
        const nextMaxCombo = Math.max(maxCombo, nextCombo);
        const pts = calculateArcadePoints(nextCombo, speedBonus);
        const nextScore = score + pts;
        const nextCorrect = correctCount + 1;

        setCombo(nextCombo);
        setMaxCombo(nextMaxCombo);
        setScore(nextScore);
        setCorrectCount(nextCorrect);
        scoreRef.current = nextScore;
        maxComboRef.current = nextMaxCombo;
        correctRef.current = nextCorrect;

        setRoundFeedback({
          correct: true,
          points: pts,
          speedBonus,
          note: currentCard.quickNote,
        });
        playComboSuccessSound(nextCombo);
        triggerComboHaptic(nextCombo);

        if (arcadeMode === 'daily' && nextTotal >= DAILY_CHALLENGE_COUNT) {
          advanceTimerRef.current = window.setTimeout(() => {
            finalizeRun(nextScore, nextCorrect, nextTotal, nextMaxCombo, 'daily');
          }, 750);
        } else {
          advanceTimerRef.current = window.setTimeout(stepToNextCard, 650);
        }
      } else {
        const nextHearts = arcadeMode === 'survival' ? hearts - 1 : hearts;
        setCombo(0);
        setHearts(nextHearts);
        setMissedRounds((prev) => [
          ...prev,
          {
            id: `${currentCard.id}-${nextTotal}`,
            prompt: currentCard.prompt,
            yourPick: currentCard.options[optIdx] || '—',
            correctAnswer: currentCard.options[currentCard.correctIdx] || '—',
            quickNote: currentCard.quickNote,
          },
        ]);
        setRoundFeedback({
          correct: false,
          points: 0,
          speedBonus: false,
          note: `Answer: ${currentCard.options[currentCard.correctIdx]}`,
        });
        playFailureSound();
        triggerIncorrectHaptic();

        if (arcadeMode === 'survival' && nextHearts <= 0) {
          advanceTimerRef.current = window.setTimeout(() => {
            finalizeRun(score, correctCount, nextTotal, maxCombo, 'survival');
          }, 900);
        } else if (arcadeMode === 'daily' && nextTotal >= DAILY_CHALLENGE_COUNT) {
          advanceTimerRef.current = window.setTimeout(() => {
            finalizeRun(score, correctCount, nextTotal, maxCombo, 'daily');
          }, 1050);
        } else {
          advanceTimerRef.current = window.setTimeout(stepToNextCard, 1100);
        }
      }
    },
    [
      gameState,
      pickedIdx,
      currentCard,
      totalAnswered,
      combo,
      maxCombo,
      score,
      correctCount,
      arcadeMode,
      hearts,
      onRecordQuestionSrs,
      stepToNextCard,
      finalizeRun,
    ]
  );

  // Desktop keyboard shortcuts (1-4 / A-D to answer; Enter / Space to advance after feedback)
  useEffect(() => {
    if (gameState !== 'PLAYING' || !currentCard) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (roundFeedback && (e.key === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        stepToNextCard();
        return;
      }
      const key = e.key.toLowerCase();
      let idx: number | null = null;
      if (key === '1' || key === 'a') idx = 0;
      else if (key === '2' || key === 'b') idx = 1;
      else if (key === '3' || key === 'c') idx = 2;
      else if (key === '4' || key === 'd') idx = 3;

      if (idx !== null && idx < currentCard.options.length) {
        e.preventDefault();
        handleSelectOption(idx);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState, currentCard, roundFeedback, handleSelectOption, stepToNextCard]);

  const activeMultiplier = getComboMultiplier(combo);
  const nextMultHint = getNextMultiplierHint(combo);
  const poolCount = useMemo(() => buildArcadePool(domainFilter).length, [domainFilter]);
  const dailyStatus = useMemo(
    () => getDailyChallengeStatus(arcadeStats, getLocalDateKey()),
    [arcadeStats, gameState]
  );

  // STATE 1: TITLE MENU
  if (gameState === 'TITLE_MENU') {
    return (
      <div className="bg-slate-900 text-white border border-slate-800 rounded-2xl p-5 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-800">
          <div>
            <p className="text-xs font-mono text-amber-400 font-semibold">
              Cloud Blitz Arena · {poolCount} Rapid Rounds Ready
            </p>
            <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-white text-balance">
              AWS Speed Blitz, Daily 5 & Survival
            </h1>
            <p className="mt-1.5 text-sm text-slate-300 max-w-2xl">
              Chain correct CLF-C02 answers under 4.5s for Speed Bonuses and up to a 4x combo
              multiplier. Every round updates your SM-2 queue and earns Cloud Rank XP.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleHaptics}
              aria-pressed={hapticsOn}
              aria-label={hapticsOn ? 'Disable arcade haptics' : 'Enable arcade haptics'}
              className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
            >
              <Vibrate
                className={`w-4 h-4 ${hapticsOn ? 'text-amber-400' : 'text-slate-400'}`}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundOn ? 'Mute arcade sound' : 'Enable arcade sound'}
              className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
            >
              {soundOn ? (
                <Volume2 className="w-4 h-4 text-amber-400" aria-hidden="true" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={onExitArena}
              className="px-3.5 min-h-[44px] text-xs font-semibold border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
            >
              Back to Quizzes
            </button>
          </div>
        </div>

        {/* High Score Telemetry Strip */}
        <div className="grid grid-cols-3 gap-3 bg-slate-800/70 border border-slate-700/80 rounded-xl p-4 text-center">
          <div>
            <p className="text-[11px] text-slate-400">Best Blitz Score</p>
            <p className="mt-0.5 font-mono text-lg sm:text-xl font-bold text-amber-400 tabular-nums">
              {arcadeStats.bestBlitzScore.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400">Best Survival Streak</p>
            <p className="mt-0.5 font-mono text-lg sm:text-xl font-bold text-emerald-400 tabular-nums">
              {arcadeStats.bestSurvivalStreak}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400">Max Combo</p>
            <p className="mt-0.5 font-mono text-lg sm:text-xl font-bold text-white tabular-nums">
              {arcadeStats.longestCombo}x
            </p>
          </div>
        </div>

        {/* Mode Selection (3 Distinct Arcade Modes) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => setArcadeMode('blitz')}
            className={`text-left p-5 rounded-xl border transition-all cursor-pointer space-y-2 ${
              arcadeMode === 'blitz'
                ? 'bg-slate-800 border-amber-400'
                : 'bg-slate-800/40 border-slate-700 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-base font-bold text-white inline-flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
                60s Speed Blitz
              </span>
              <span className="font-mono text-xs text-amber-400 font-semibold shrink-0">
                60s Clock
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Answer as many rounds as possible in 60 seconds. Beat the 4.5s Speed Window to surge
              to 4x multipliers.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setArcadeMode('daily')}
            className={`text-left p-5 rounded-xl border transition-all cursor-pointer space-y-2 ${
              arcadeMode === 'daily'
                ? 'bg-slate-800 border-sky-400'
                : 'bg-slate-800/40 border-slate-700 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-base font-bold text-white inline-flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-sky-400 shrink-0" aria-hidden="true" />
                Today&apos;s Daily 5
              </span>
              <span className="font-mono text-xs text-sky-300 font-semibold shrink-0 tabular-nums">
                {dailyStatus.completed ? 'Cleared' : `+${DAILY_CHALLENGE_BONUS_XP} XP`}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {dailyStatus.completed
                ? `Completed today (${dailyStatus.correctCount}/${dailyStatus.totalCount} · Best ${dailyStatus.bestScore.toLocaleString()} pts). Replay anytime.`
                : `5 curated questions across CLF-C02 domains. Clear today's set for a +${DAILY_CHALLENGE_BONUS_XP} XP daily bonus.`}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setArcadeMode('survival')}
            className={`text-left p-5 rounded-xl border transition-all cursor-pointer space-y-2 ${
              arcadeMode === 'survival'
                ? 'bg-slate-800 border-emerald-400'
                : 'bg-slate-800/40 border-slate-700 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-base font-bold text-white inline-flex items-center gap-2">
                <Heart className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />
                3-Heart Survival
              </span>
              <span className="font-mono text-xs text-emerald-400 font-semibold shrink-0">
                3 Lives
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              No round timer—focus purely on accuracy and streak mastery. Three wrong answers end
              the run.
            </p>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2.5">
            <label htmlFor="arcade-domain" className="text-xs font-semibold text-slate-300 shrink-0">
              Arena Scope:
            </label>
            <select
              id="arcade-domain"
              disabled={arcadeMode === 'daily'}
              value={arcadeMode === 'daily' ? 'all' : domainFilter}
              onChange={(e) => setDomainFilter(e.target.value as DomainId | 'all')}
              className="flex-1 sm:flex-initial px-3 min-h-[44px] text-base sm:text-sm bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400 disabled:opacity-50"
            >
              <option value="all">All 4 Domains + Shared Model</option>
              {EXAM_DOMAINS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.number}. {d.title}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => startRound(arcadeMode)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 min-h-[48px] text-sm font-bold bg-[#C2410C] hover:bg-[#9A3412] active:scale-[0.98] text-white rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <Play className="w-4 h-4 fill-current" aria-hidden="true" />
            {arcadeMode === 'blitz'
              ? 'Start Speed Blitz'
              : arcadeMode === 'daily'
              ? 'Start Daily 5 Challenge'
              : 'Start Survival Run'}
          </button>
        </div>

        <div className="pt-2">
          <AchievementsDisplay
            progress={studyProgress}
            onClaimReward={onClaimAchievement}
            onClaimAllRewards={onClaimAllAchievements}
            onNavigateAction={onNavigateSection}
            compact
            darkSurface
          />
        </div>
      </div>
    );
  }

  // STATE 3: GAME OVER / SUMMARY
  if (gameState === 'GAME_OVER') {
    const accuracy =
      totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
    const baseXp = Math.max(correctCount > 0 ? 15 : 0, Math.round(score / 10));
    const displayXp = baseXp + (earnedDailyBonus ? DAILY_CHALLENGE_BONUS_XP : 0);

    return (
      <div className="bg-slate-900 text-white border border-slate-800 rounded-2xl p-6 sm:p-10 space-y-6 text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-400/30 text-amber-400 mx-auto">
          {arcadeMode === 'daily' ? (
            <CalendarCheck className="w-7 h-7" aria-hidden="true" />
          ) : (
            <Trophy className="w-7 h-7" aria-hidden="true" />
          )}
        </div>

        <div>
          <p className="text-xs font-mono text-amber-400 font-semibold inline-flex items-center justify-center gap-1.5">
            {isNewRecord && <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />}
            {arcadeMode === 'blitz'
              ? isNewRecord
                ? 'New Personal Best · 60s Blitz Complete'
                : '60-Second Blitz Complete'
              : arcadeMode === 'daily'
              ? earnedDailyBonus
                ? `Daily 5 Cleared · +${DAILY_CHALLENGE_BONUS_XP} Bonus XP`
                : 'Daily 5 Sprint Complete'
              : isNewRecord
              ? 'New Survival Record!'
              : 'Survival Run Complete'}
          </p>
          <h2 className="mt-1 font-display text-3xl sm:text-4xl font-bold text-white font-mono tabular-nums">
            {score.toLocaleString()} pts
          </h2>
          <p className="mt-1.5 text-sm text-slate-300 tabular-nums">
            +{displayXp} Cloud XP earned · {correctCount}/{totalAnswered} right ({accuracy}%)
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 bg-slate-800/80 border border-slate-700 rounded-xl p-4 text-center">
          <div>
            <p className="text-[11px] text-slate-400">Peak Streak</p>
            <p className="font-mono text-lg font-bold text-amber-400 tabular-nums">
              {maxCombo}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400">Accuracy</p>
            <p className="font-mono text-lg font-bold text-emerald-400 tabular-nums">
              {accuracy}%
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400">
              {arcadeMode === 'daily' ? 'Daily Best' : 'Personal Best'}
            </p>
            <p className="font-mono text-lg font-bold text-white tabular-nums">
              {arcadeMode === 'blitz'
                ? Math.max(arcadeStats.bestBlitzScore, score).toLocaleString()
                : arcadeMode === 'survival'
                ? Math.max(arcadeStats.bestSurvivalStreak, correctCount)
                : Math.max(dailyStatus.bestScore, score).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => startRound(arcadeMode)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 min-h-[48px] text-sm font-bold bg-[#C2410C] hover:bg-[#9A3412] active:scale-[0.98] text-white rounded-xl cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Play Again
          </button>
          <button
            type="button"
            onClick={() => setGameState('TITLE_MENU')}
            className="w-full sm:w-auto px-5 min-h-[48px] text-sm font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl cursor-pointer whitespace-nowrap"
          >
            Change Mode
          </button>
          <button
            type="button"
            onClick={onExitArena}
            className="w-full sm:w-auto px-5 min-h-[48px] text-sm font-medium text-slate-400 hover:text-white cursor-pointer whitespace-nowrap"
          >
            Quiz Hub
          </button>
        </div>

        {missedRounds.length > 0 && (
          <div className="pt-2 text-left border-t border-slate-800">
            <button
              type="button"
              onClick={() => setShowMissedReview((v) => !v)}
              className="w-full min-h-[44px] flex items-center justify-between text-xs font-semibold text-amber-300 hover:text-amber-200 cursor-pointer"
            >
              <span>Review Missed Questions ({missedRounds.length})</span>
              {showMissedReview ? (
                <ChevronUp className="w-4 h-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              )}
            </button>

            {showMissedReview && (
              <div className="mt-3 space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {missedRounds.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl bg-slate-800/80 border border-slate-700 p-3.5 space-y-1.5 text-xs"
                  >
                    <p className="font-semibold text-white leading-snug">{m.prompt}</p>
                    <p className="text-rose-300">
                      Your pick: <span className="font-medium">{m.yourPick}</span>
                    </p>
                    <p className="text-emerald-300">
                      Correct: <span className="font-semibold">{m.correctAnswer}</span>
                    </p>
                    <p className="text-slate-300 leading-relaxed pt-1 border-t border-slate-700/70">
                      {m.quickNote}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="text-left pt-2">
          <AchievementsDisplay
            progress={studyProgress}
            onClaimReward={onClaimAchievement}
            onClaimAllRewards={onClaimAllAchievements}
            onNavigateAction={onNavigateSection}
            compact
            darkSurface
          />
        </div>
      </div>
    );
  }

  // STATE 2: ACTIVE GAMEPLAY ARENA
  if (!currentCard) return null;

  const timerPct =
    arcadeMode === 'blitz'
      ? Math.max(0, Math.round((secondsLeft / BLITZ_DURATION_SEC) * 100))
      : arcadeMode === 'daily'
      ? Math.round(((totalAnswered + (pickedIdx === null ? 0 : 0)) / DAILY_CHALLENGE_COUNT) * 100)
      : 100;

  return (
    <div
      className={`bg-slate-900 text-white border rounded-2xl p-4 sm:p-7 space-y-5 max-w-3xl mx-auto transition-colors duration-200 ${
        activeMultiplier >= 4 ? 'border-amber-400/70' : 'border-slate-800'
      }`}
    >
      {/* Unobtrusive Top Arcade HUD */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 sm:gap-5 font-mono tabular-nums">
          <div>
            <p className="text-[10px] text-slate-400">SCORE</p>
            <p className="text-lg sm:text-xl font-bold text-white leading-tight">
              {score.toLocaleString()}
            </p>
          </div>
          <div key={combo} className={combo > 0 ? 'animate-combo-bump' : ''}>
            <p className="text-[10px] text-slate-400">
              {activeMultiplier >= 4 ? 'FEVER ACTIVE · MAX' : `COMBO · ${nextMultHint}`}
            </p>
            <p
              className={`text-lg sm:text-xl font-bold leading-tight inline-flex items-center gap-1 ${
                activeMultiplier >= 3
                  ? 'text-amber-400'
                  : activeMultiplier === 2
                  ? 'text-emerald-400'
                  : 'text-slate-300'
              }`}
            >
              <Flame className="w-4 h-4" aria-hidden="true" />
              {combo} ({activeMultiplier}x)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {arcadeMode === 'blitz' ? (
            <div
              className={`inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg border font-mono tabular-nums text-sm font-bold ${
                secondsLeft <= 10
                  ? 'bg-rose-500/20 border-rose-400 text-rose-300'
                  : 'bg-slate-800 border-slate-700 text-white'
              }`}
            >
              <Clock className="w-4 h-4 text-amber-400" aria-hidden="true" />
              {secondsLeft}s
            </div>
          ) : arcadeMode === 'daily' ? (
            <div className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg bg-slate-800 border border-slate-700 font-mono text-xs font-bold tabular-nums text-sky-300">
              <CalendarCheck className="w-4 h-4 text-sky-400" aria-hidden="true" />
              {Math.min(cardIdx + 1, DAILY_CHALLENGE_COUNT)}/{DAILY_CHALLENGE_COUNT}
            </div>
          ) : (
            <div
              aria-label={`Lives remaining: ${hearts} of ${MAX_HEARTS}`}
              className="inline-flex items-center gap-1 px-3 min-h-[44px] rounded-lg bg-slate-800 border border-slate-700 font-mono text-xs font-bold tabular-nums"
            >
              {Array.from({ length: MAX_HEARTS }).map((_, idx) => (
                <Heart
                  key={idx}
                  className={`w-4 h-4 ${
                    idx < hearts ? 'text-rose-500 fill-rose-500' : 'text-slate-600'
                  }`}
                  aria-hidden="true"
                />
              ))}
              <span className="ml-1 text-slate-300">
                {hearts}/{MAX_HEARTS}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={toggleHaptics}
            aria-pressed={hapticsOn}
            aria-label={hapticsOn ? 'Disable haptics' : 'Enable haptics'}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer"
          >
            <Vibrate
              className={`w-4 h-4 ${hapticsOn ? 'text-amber-400' : 'text-slate-400'}`}
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            onClick={toggleSound}
            aria-label={soundOn ? 'Mute sound' : 'Enable sound'}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer"
          >
            {soundOn ? (
              <Volume2 className="w-4 h-4 text-amber-400" aria-hidden="true" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              clearAdvanceTimer();
              setGameState('TITLE_MENU');
            }}
            className="px-3 min-h-[44px] text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg cursor-pointer"
          >
            Quit
          </button>
        </div>
      </div>

      {/* Blitz or Daily Progress Bar */}
      {(arcadeMode === 'blitz' || arcadeMode === 'daily') && (
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              arcadeMode === 'daily'
                ? 'bg-sky-400'
                : secondsLeft <= 10
                ? 'bg-rose-500'
                : 'bg-amber-400'
            }`}
            style={{ width: `${timerPct}%` }}
          />
        </div>
      )}

      {/* High-Contrast Question Card */}
      <div className="bg-white text-slate-900 rounded-xl p-5 sm:p-7 space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 font-mono tabular-nums">
            <span>
              {arcadeMode === 'daily'
                ? `Daily ${Math.min(cardIdx + 1, DAILY_CHALLENGE_COUNT)}/${DAILY_CHALLENGE_COUNT}`
                : `Round #${totalAnswered + 1}`}{' '}
              · {currentCard.domainTitle}
            </span>
            <span className="text-[11px] font-semibold text-amber-700">
              {speedWindowRatio > 0 ? '4.5s Speed Bonus Active' : 'Standard Points'}
            </span>
          </div>
          {/* Live 4.5s Speed Bonus Window Bar (compositor scaleX) */}
          <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full origin-left ${
                speedWindowRatio > 0.35 ? 'bg-amber-500' : 'bg-slate-400'
              }`}
              style={{ transform: `scaleX(${speedWindowRatio})` }}
            />
          </div>
        </div>

        <h2 className="font-display text-base sm:text-xl font-bold text-slate-900 leading-snug text-balance">
          {currentCard.prompt}
        </h2>

        <div className="space-y-2.5">
          {currentCard.options.map((optText, idx) => {
            const isPicked = pickedIdx === idx;
            const isAnswer = idx === currentCard.correctIdx;

            let btnStyle =
              'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 text-slate-900';
            if (pickedIdx !== null) {
              if (isAnswer) {
                btnStyle = 'border-emerald-500 bg-emerald-50 text-emerald-950';
              } else if (isPicked && !isAnswer) {
                btnStyle = 'border-rose-400 bg-rose-50 text-rose-950';
              } else {
                btnStyle = 'border-slate-100 bg-white text-slate-400 opacity-70';
              }
            }

            return (
              <button
                key={`${currentCard.id}-${idx}`}
                type="button"
                disabled={pickedIdx !== null}
                onClick={() => handleSelectOption(idx)}
                className={`w-full text-left px-4 py-3.5 min-h-[52px] rounded-xl border transition-all duration-100 active:scale-[0.985] cursor-pointer flex items-center gap-3 ${btnStyle}`}
              >
                <span className="font-mono text-xs font-bold w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <span className="text-sm font-medium leading-snug flex-1">{optText}</span>
              </button>
            );
          })}
        </div>

        {/* Immediate Hit/Miss Feedback Strip */}
        {roundFeedback && (
          <div
            className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 text-xs ${
              roundFeedback.correct
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-rose-50 border-rose-200 text-rose-950'
            }`}
          >
            <div className="flex items-start gap-2">
              {roundFeedback.correct ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <div>
                <p className="font-bold">
                  {roundFeedback.correct
                    ? `+${roundFeedback.points} pts${roundFeedback.speedBonus ? ' · Speed Bonus!' : ''}`
                    : 'Combo Broken'}
                </p>
                <p className="mt-0.5 opacity-90 line-clamp-2">{roundFeedback.note}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={stepToNextCard}
              className="px-3.5 min-h-[44px] font-semibold bg-white border border-slate-200 rounded-md text-slate-800 shrink-0 cursor-pointer hover:bg-slate-50 whitespace-nowrap"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
