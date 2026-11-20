import { AWS_SERVICES, EXAM_DOMAINS } from '../data/awsServices';
import { FLASHCARDS } from '../data/flashcards';
import { PRACTICE_SCENARIOS } from '../data/practiceScenarios';
import { QUIZ_QUESTIONS } from '../data/quizQuestions';
import { ArcadeStats, DomainId, NavSection, StudyProgress } from '../data/types';

export interface CloudRankInfo {
  level: number;
  title: string;
  currentXp: number;
  levelFloorXp: number;
  nextLevelXp: number;
  progressPct: number;
}

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';
export type AchievementCategory = 'arcade' | 'labs' | 'mastery' | 'consistency';

export interface AchievementBadge {
  id: string;
  title: string;
  detail: string;
  category: AchievementCategory;
  tier: AchievementTier;
  xpReward: number;
  unlocked: boolean;
  claimed: boolean;
  progressCurrent: number;
  progressTarget: number;
  progressText: string;
  targetSection: NavSection;
  actionLabel: string;
}

export const DAILY_XP_GOAL = 150;
export const DAILY_GOAL_BONUS_XP = 50;
export const DAILY_CHALLENGE_COUNT = 5;
export const DAILY_CHALLENGE_BONUS_XP = 75;

const RANK_TITLES = [
  'Cloud Cadet',
  'VPC Scout',
  'IAM Guardian',
  'S3 Strategist',
  'Serverless Ace',
  'Resilience Ranger',
  'Well-Architected Pro',
  'CLF-C02 Grandmaster',
];

const XP_PER_LEVEL = 450;

export function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getPreviousLocalDateKey(dateKey: string): string {
  const parts = dateKey.split('-').map((n) => Number(n));
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n))) {
    return '';
  }
  const [y, m, d] = parts;
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - 1);
  const py = utc.getUTCFullYear();
  const pm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const pd = String(utc.getUTCDate()).padStart(2, '0');
  return `${py}-${pm}-${pd}`;
}

export function getEffectiveDailyXp(
  arcade: ArcadeStats,
  todayKey = getLocalDateKey()
): number {
  return arcade.dailyDate === todayKey ? arcade.dailyXp : 0;
}

export function getEffectiveStreakDays(
  arcade: ArcadeStats,
  todayKey = getLocalDateKey()
): number {
  if (!arcade.lastActiveDate) return 0;
  if (arcade.lastActiveDate === todayKey) {
    return arcade.streakDays;
  }
  if (arcade.lastActiveDate === getPreviousLocalDateKey(todayKey)) {
    return arcade.streakDays;
  }
  return 0;
}

export function updateDailyArcadeProgress(
  prev: ArcadeStats,
  xpEarned: number,
  todayKey = getLocalDateKey()
): {
  arcade: ArcadeStats;
  totalXpDelta: number;
  hitDailyGoalBonus: boolean;
} {
  if (xpEarned <= 0) {
    return {
      arcade: prev,
      totalXpDelta: 0,
      hitDailyGoalBonus: false,
    };
  }

  const prevDailyXp = prev.dailyDate === todayKey ? prev.dailyXp : 0;
  const nextDailyXp = prevDailyXp + xpEarned;

  const yesterdayKey = getPreviousLocalDateKey(todayKey);
  let nextStreak = prev.streakDays;
  if (prev.lastActiveDate === todayKey) {
    nextStreak = Math.max(1, prev.streakDays);
  } else if (prev.lastActiveDate === yesterdayKey) {
    nextStreak = Math.max(1, prev.streakDays) + 1;
  } else {
    nextStreak = 1;
  }

  const hitDailyGoalBonus =
    nextDailyXp >= DAILY_XP_GOAL && prev.dailyGoalBonusDate !== todayKey;
  const bonusXp = hitDailyGoalBonus ? DAILY_GOAL_BONUS_XP : 0;
  const totalXpDelta = xpEarned + bonusXp;

  const history = prev.dailyXpHistory ? { ...prev.dailyXpHistory } : {};
  const prevDayXp = history[todayKey] || (prev.dailyDate === todayKey ? prev.dailyXp : 0);
  const nextDayXp = prevDayXp + totalXpDelta;
  history[todayKey] = nextDayXp;

  return {
    arcade: {
      ...prev,
      xp: prev.xp + totalXpDelta,
      streakDays: nextStreak,
      lastActiveDate: todayKey,
      dailyXp: nextDailyXp,
      dailyDate: todayKey,
      dailyGoalBonusDate: hitDailyGoalBonus ? todayKey : prev.dailyGoalBonusDate,
      dailyXpHistory: history,
    },
    totalXpDelta,
    hitDailyGoalBonus,
  };
}

export interface DailyActivityItem {
  dateKey: string;
  dayLabel: string;
  shortDate: string;
  xp: number;
  goalAchieved: boolean;
  pctOfGoal: number;
}

export function getLast7DaysActivity(arcade?: ArcadeStats): DailyActivityItem[] {
  const history = arcade?.dailyXpHistory || {};
  const today = new Date();
  const days: DailyActivityItem[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateKey = getLocalDateKey(d);
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
    const shortDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    let xp = history[dateKey] || 0;
    if (i === 0 && xp === 0 && arcade?.dailyDate === dateKey) {
      xp = arcade.dailyXp;
    }

    const goalAchieved = xp >= DAILY_XP_GOAL;
    const pctOfGoal = Math.min(100, Math.round((xp / DAILY_XP_GOAL) * 100));

    days.push({
      dateKey,
      dayLabel,
      shortDate,
      xp,
      goalAchieved,
      pctOfGoal,
    });
  }

  return days;
}

export function getCloudRank(rawXp: number): CloudRankInfo {
  const safeXp = Math.max(0, Math.floor(Number.isFinite(rawXp) ? rawXp : 0));
  const level = Math.floor(safeXp / XP_PER_LEVEL) + 1;
  const levelFloorXp = (level - 1) * XP_PER_LEVEL;
  const nextLevelXp = level * XP_PER_LEVEL;
  const progressPct = Math.min(
    100,
    Math.round(((safeXp - levelFloorXp) / XP_PER_LEVEL) * 100)
  );
  const titleIdx = Math.min(level - 1, RANK_TITLES.length - 1);

  return {
    level,
    title: RANK_TITLES[titleIdx],
    currentXp: safeXp,
    levelFloorXp,
    nextLevelXp,
    progressPct,
  };
}

export function getComboMultiplier(combo: number): number {
  if (combo >= 8) return 4;
  if (combo >= 5) return 3;
  if (combo >= 2) return 2;
  return 1;
}

export function getNextMultiplierHint(combo: number): string {
  if (combo >= 8) return '4x MAX';
  if (combo >= 5) return `${8 - combo} to 4x`;
  if (combo >= 2) return `${5 - combo} to 3x`;
  return `${2 - combo} to 2x`;
}

export function calculateArcadePoints(
  comboAfterHit: number,
  speedBonus: boolean
): number {
  const mult = getComboMultiplier(comboAfterHit);
  const base = 100 * mult;
  return base + (speedBonus ? 50 * mult : 0);
}

export function getAchievements(
  progress: StudyProgress,
  todayKey = getLocalDateKey()
): AchievementBadge[] {
  const arcade = progress.arcade;
  const dailyXp = getEffectiveDailyXp(arcade, todayKey);
  const streakDays = getEffectiveStreakDays(arcade, todayKey);
  const claimedSet = new Set(progress.claimedAchievements || []);
  const perfectLabs = (progress.perfectScenarios || []).length;
  const solvedLabs = progress.completedScenarios.length;
  const longTermCards = FLASHCARDS.filter(
    (c) => (progress.flashcardSrs[c.id]?.intervalDays ?? 0) >= 6
  ).length;
  const bestScaled =
    progress.quizHistory.length > 0
      ? Math.max(...progress.quizHistory.map((q) => q.scaledScore))
      : 0;
  const dailyGoalHit = dailyXp >= DAILY_XP_GOAL || Boolean(arcade.dailyGoalBonusDate);

  return [
    {
      id: 'first-blitz',
      title: 'First Blitz',
      detail: 'Complete a Cloud Blitz or Survival arcade run',
      category: 'arcade',
      tier: 'bronze',
      xpReward: 40,
      unlocked: arcade.gamesPlayed >= 1,
      claimed: claimedSet.has('first-blitz'),
      progressCurrent: Math.min(arcade.gamesPlayed, 1),
      progressTarget: 1,
      progressText: `${Math.min(arcade.gamesPlayed, 1)}/1 run`,
      targetSection: 'quizzes',
      actionLabel: 'Play Blitz',
    },
    {
      id: 'ten-combo',
      title: '10-Question Combo',
      detail: 'Chain 10 consecutive correct answers in Arcade mode',
      category: 'arcade',
      tier: 'gold',
      xpReward: 100,
      unlocked: arcade.longestCombo >= 10,
      claimed: claimedSet.has('ten-combo'),
      progressCurrent: Math.min(arcade.longestCombo, 10),
      progressTarget: 10,
      progressText: `${Math.min(arcade.longestCombo, 10)}/10 combo`,
      targetSection: 'quizzes',
      actionLabel: 'Enter Arena',
    },
    {
      id: 'perfect-lab',
      title: 'First Perfect Lab',
      detail: 'Solve an architecture decision lab on your very first try',
      category: 'labs',
      tier: 'silver',
      xpReward: 60,
      unlocked: perfectLabs >= 1,
      claimed: claimedSet.has('perfect-lab'),
      progressCurrent: Math.min(perfectLabs, 1),
      progressTarget: 1,
      progressText: `${Math.min(perfectLabs, 1)}/1 perfect`,
      targetSection: 'practice',
      actionLabel: 'Open Labs',
    },
    {
      id: 'lab-architect',
      title: 'Lab Architect',
      detail: 'Complete 3 hands-on AWS architecture labs',
      category: 'labs',
      tier: 'gold',
      xpReward: 90,
      unlocked: solvedLabs >= 3,
      claimed: claimedSet.has('lab-architect'),
      progressCurrent: Math.min(solvedLabs, 3),
      progressTarget: 3,
      progressText: `${Math.min(solvedLabs, 3)}/3 labs`,
      targetSection: 'practice',
      actionLabel: 'Solve Labs',
    },
    {
      id: 'daily-goal',
      title: 'Daily Sprint',
      detail: `Earn ${DAILY_XP_GOAL} XP in a single day`,
      category: 'consistency',
      tier: 'bronze',
      xpReward: 50,
      unlocked: dailyGoalHit,
      claimed: claimedSet.has('daily-goal'),
      progressCurrent: dailyGoalHit ? DAILY_XP_GOAL : Math.min(dailyXp, DAILY_XP_GOAL),
      progressTarget: DAILY_XP_GOAL,
      progressText: dailyGoalHit
        ? `${DAILY_XP_GOAL}/${DAILY_XP_GOAL} XP`
        : `${Math.min(dailyXp, DAILY_XP_GOAL)}/${DAILY_XP_GOAL} XP`,
      targetSection: 'quizzes',
      actionLabel: 'Earn XP',
    },
    {
      id: 'streak-3',
      title: '3-Day Cloud Streak',
      detail: 'Earn study XP on 3 consecutive calendar days',
      category: 'consistency',
      tier: 'silver',
      xpReward: 80,
      unlocked: streakDays >= 3,
      claimed: claimedSet.has('streak-3'),
      progressCurrent: Math.min(streakDays, 3),
      progressTarget: 3,
      progressText: `${Math.min(streakDays, 3)}/3 days`,
      targetSection: 'flashcards',
      actionLabel: 'Study Today',
    },
    {
      id: 'memory-vault',
      title: 'Memory Vault',
      detail: 'Lock 10 flashcards into 6+ day SM-2 review intervals',
      category: 'mastery',
      tier: 'silver',
      xpReward: 75,
      unlocked: longTermCards >= 10,
      claimed: claimedSet.has('memory-vault'),
      progressCurrent: Math.min(longTermCards, 10),
      progressTarget: 10,
      progressText: `${Math.min(longTermCards, 10)}/10 cards`,
      targetSection: 'flashcards',
      actionLabel: 'Drill Deck',
    },
    {
      id: 'exam-ready',
      title: 'Exam Ready',
      detail: 'Achieve a 700+ scaled passing score on a CLF-C02 quiz',
      category: 'mastery',
      tier: 'platinum',
      xpReward: 150,
      unlocked: bestScaled >= 700,
      claimed: claimedSet.has('exam-ready'),
      progressCurrent: Math.min(bestScaled, 700),
      progressTarget: 700,
      progressText: bestScaled > 0 ? `${Math.min(bestScaled, 700)}/700` : '0/700',
      targetSection: 'quizzes',
      actionLabel: 'Take Exam',
    },
  ];
}

const DAILY_CHALLENGE_STORAGE_KEY = 'cloudprep_daily_challenge_v1';

export interface DailyChallengeStatus {
  completed: boolean;
  dateKey: string;
  bestScore: number;
  correctCount: number;
  totalCount: number;
}

export function getDailyChallengeSeed(dateKey = getLocalDateKey()): number {
  let hash = 2166136261;
  for (let i = 0; i < dateKey.length; i++) {
    hash ^= dateKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function clearLocalDailyChallenge(): void {
  try {
    window.localStorage.removeItem(DAILY_CHALLENGE_STORAGE_KEY);
  } catch {
    // Ignore storage errors gracefully
  }
}

export function getDailyChallengeStatus(
  arcade?: ArcadeStats,
  dateKey = getLocalDateKey()
): DailyChallengeStatus {
  if (arcade?.dailyChallengeDate === dateKey) {
    return {
      completed: true,
      dateKey,
      bestScore:
        typeof arcade.dailyChallengeScore === 'number' && Number.isFinite(arcade.dailyChallengeScore)
          ? arcade.dailyChallengeScore
          : 0,
      correctCount:
        typeof arcade.dailyChallengeCorrect === 'number' &&
        Number.isFinite(arcade.dailyChallengeCorrect)
          ? arcade.dailyChallengeCorrect
          : 0,
      totalCount:
        typeof arcade.dailyChallengeTotal === 'number' &&
        Number.isFinite(arcade.dailyChallengeTotal) &&
        arcade.dailyChallengeTotal > 0
          ? arcade.dailyChallengeTotal
          : DAILY_CHALLENGE_COUNT,
    };
  }

  try {
    const raw = window.localStorage.getItem(DAILY_CHALLENGE_STORAGE_KEY);
    if (!raw) {
      return {
        completed: false,
        dateKey,
        bestScore: 0,
        correctCount: 0,
        totalCount: DAILY_CHALLENGE_COUNT,
      };
    }
    const parsed = JSON.parse(raw) as Partial<DailyChallengeStatus> | null;
    if (!parsed || parsed.dateKey !== dateKey) {
      return {
        completed: false,
        dateKey,
        bestScore: 0,
        correctCount: 0,
        totalCount: DAILY_CHALLENGE_COUNT,
      };
    }
    return {
      completed: Boolean(parsed.completed),
      dateKey,
      bestScore: typeof parsed.bestScore === 'number' && Number.isFinite(parsed.bestScore) ? parsed.bestScore : 0,
      correctCount: typeof parsed.correctCount === 'number' && Number.isFinite(parsed.correctCount) ? parsed.correctCount : 0,
      totalCount: typeof parsed.totalCount === 'number' && Number.isFinite(parsed.totalCount) ? parsed.totalCount : DAILY_CHALLENGE_COUNT,
    };
  } catch {
    return {
      completed: false,
      dateKey,
      bestScore: 0,
      correctCount: 0,
      totalCount: DAILY_CHALLENGE_COUNT,
    };
  }
}

export function saveDailyChallengeResult(
  dateKey: string,
  correctCount: number,
  totalCount: number,
  score: number,
  arcade?: ArcadeStats
): { isFirstCompletionToday: boolean; status: DailyChallengeStatus } {
  const existing = getDailyChallengeStatus(arcade, dateKey);
  const isFirstCompletionToday = !existing.completed;
  const nextStatus: DailyChallengeStatus = {
    completed: true,
    dateKey,
    bestScore: Math.max(existing.bestScore, Math.max(0, Math.round(score))),
    correctCount: isFirstCompletionToday
      ? correctCount
      : Math.max(existing.correctCount, correctCount),
    totalCount: Math.max(1, totalCount),
  };

  try {
    window.localStorage.setItem(DAILY_CHALLENGE_STORAGE_KEY, JSON.stringify(nextStatus));
  } catch {
    // Ignore storage quota errors gracefully
  }

  return { isFirstCompletionToday, status: nextStatus };
}

export interface DomainReadinessItem {
  domainId: DomainId;
  number: string;
  title: string;
  weight: number;
  masteryPct: number;
  quizAccuracyPct: number | null;
  quizAttempted: number;
  quizTotal: number;
  flashcardsMastered: number;
  flashcardsTotal: number;
  servicesReviewed: number;
  servicesTotal: number;
  labsCompleted: number;
  labsTotal: number;
}

export interface ExamReadinessSummary {
  scaledForecast: number;
  weightedReadinessPct: number;
  coveragePct: number;
  isPassingForecast: boolean;
  deltaToPass: number;
  statusLabel: 'Not Started' | 'Building Foundation' | 'Closing In' | 'Pass Ready';
  weakestDomain: DomainReadinessItem;
  domains: DomainReadinessItem[];
}

export function computeExamReadiness(progress: StudyProgress): ExamReadinessSummary {
  const reviewedSet = new Set(progress.reviewedServices);
  const solvedLabsSet = new Set(progress.completedScenarios);

  const domainItems: DomainReadinessItem[] = EXAM_DOMAINS.map((domain) => {
    const dQuizzes = QUIZ_QUESTIONS.filter((q) => q.domain === domain.id);
    const dCards = FLASHCARDS.filter((c) => c.domain === domain.id);
    const dServices = AWS_SERVICES.filter((s) => s.domain === domain.id);
    const dLabs = PRACTICE_SCENARIOS.filter((l) => l.domain === domain.id);

    let quizAttempted = 0;
    let quizAttemptsSum = 0;
    let quizCorrectSum = 0;
    let quizRetentionScore = 0;

    dQuizzes.forEach((q) => {
      const st = progress.quizSrs[q.id];
      if (st && st.attemptCount > 0) {
        quizAttempted += 1;
        quizAttemptsSum += st.attemptCount;
        quizCorrectSum += st.correctCount;
        const itemAcc = st.correctCount / st.attemptCount;
        const intervalBonus = st.intervalDays >= 6 ? 1 : st.intervalDays >= 1 ? 0.82 : 0.45;
        quizRetentionScore += itemAcc * 0.65 + intervalBonus * 0.35;
      }
    });

    const quizAccuracyPct =
      quizAttemptsSum > 0 ? Math.round((quizCorrectSum / quizAttemptsSum) * 100) : null;
    const quizMastery = dQuizzes.length > 0 ? quizRetentionScore / dQuizzes.length : 0;

    let cardScore = 0;
    let flashcardsMastered = 0;
    dCards.forEach((card) => {
      const st = progress.flashcardSrs[card.id];
      if (st) {
        if (st.intervalDays >= 6) {
          cardScore += 1;
          flashcardsMastered += 1;
        } else if (st.intervalDays >= 1) {
          cardScore += 0.68;
          flashcardsMastered += 1;
        } else {
          cardScore += 0.25;
        }
      }
    });
    const flashcardMastery = dCards.length > 0 ? cardScore / dCards.length : 0;

    const servicesReviewed = dServices.filter((s) => reviewedSet.has(s.id)).length;
    const serviceMastery = dServices.length > 0 ? servicesReviewed / dServices.length : 0;

    const labsCompleted = dLabs.filter((l) => solvedLabsSet.has(l.id)).length;
    const labMastery = dLabs.length > 0 ? labsCompleted / dLabs.length : serviceMastery;

    const masteryRatio = Math.min(
      1,
      quizMastery * 0.46 + flashcardMastery * 0.26 + labMastery * 0.16 + serviceMastery * 0.12
    );

    return {
      domainId: domain.id,
      number: domain.number,
      title: domain.title,
      weight: domain.weight,
      masteryPct: Math.round(masteryRatio * 100),
      quizAccuracyPct,
      quizAttempted,
      quizTotal: dQuizzes.length,
      flashcardsMastered,
      flashcardsTotal: dCards.length,
      servicesReviewed,
      servicesTotal: dServices.length,
      labsCompleted,
      labsTotal: dLabs.length,
    };
  });

  const weightedReadinessPct = Math.round(
    domainItems.reduce((sum, item) => sum + item.masteryPct * (item.weight / 100), 0)
  );

  // Combine weighted mastery with best/recent quiz performance so real exam prep moves naturally to 700+
  const totalBankItems =
    QUIZ_QUESTIONS.length + FLASHCARDS.length + AWS_SERVICES.length + PRACTICE_SCENARIOS.length;
  const touchedQuizCount = QUIZ_QUESTIONS.filter(
    (q) => (progress.quizSrs[q.id]?.attemptCount ?? 0) > 0
  ).length;
  const touchedCardCount = FLASHCARDS.filter((c) => Boolean(progress.flashcardSrs[c.id])).length;
  const touchedCount =
    touchedQuizCount +
    touchedCardCount +
    progress.reviewedServices.length +
    progress.completedScenarios.length;
  const coveragePct = Math.round((touchedCount / Math.max(1, totalBankItems)) * 100);

  const recentQuizSignal =
    progress.quizHistory.length > 0
      ? Math.max(...progress.quizHistory.slice(-3).map((q) => q.scaledScore))
      : null;

  // Map 66% weighted readiness -> ~700 CLF-C02 pass threshold smoothly
  const masteryScaled = Math.round(
    100 + Math.min(1, weightedReadinessPct / 95) * 900
  );
  const scaledForecast =
    touchedCount === 0 && recentQuizSignal === null
      ? 100
      : Math.min(
          1000,
          Math.max(
            100,
            recentQuizSignal !== null
              ? Math.round(masteryScaled * 0.7 + recentQuizSignal * 0.3)
              : masteryScaled
          )
        );

  const isPassingForecast = scaledForecast >= 700;
  const deltaToPass = Math.max(0, 700 - scaledForecast);

  let statusLabel: ExamReadinessSummary['statusLabel'] = 'Not Started';
  if (touchedCount === 0 && recentQuizSignal === null) {
    statusLabel = 'Not Started';
  } else if (scaledForecast >= 700) {
    statusLabel = 'Pass Ready';
  } else if (scaledForecast >= 520) {
    statusLabel = 'Closing In';
  } else {
    statusLabel = 'Building Foundation';
  }

  const weakestDomain = [...domainItems].sort((a, b) => {
    if (a.masteryPct !== b.masteryPct) return a.masteryPct - b.masteryPct;
    return b.weight - a.weight;
  })[0];

  return {
    scaledForecast,
    weightedReadinessPct,
    coveragePct,
    isPassingForecast,
    deltaToPass,
    statusLabel,
    weakestDomain,
    domains: domainItems,
  };
}

