import { AWS_SERVICES, EXAM_DOMAINS } from '../data/awsServices';
import { FLASHCARDS } from '../data/flashcards';
import { PRACTICE_SCENARIOS } from '../data/practiceScenarios';
import { QUIZ_QUESTIONS } from '../data/quizQuestions';
import { DomainId, NavSection, QuizAttemptRecord, StudyProgress } from '../data/types';
import {
  computeExamReadiness,
  DAILY_XP_GOAL,
  getCloudRank,
  getDailyChallengeStatus,
  getEffectiveDailyXp,
  getEffectiveStreakDays,
} from './arcade';
import { getEarliestNextDueLabel, isItemDue } from './spacedRepetition';

export interface ActiveStudyContext {
  type: 'service' | 'lab' | 'quiz' | 'flashcard' | 'overview';
  title: string;
  details?: string;
  domainTitle?: string;
  isAnswerVisible?: boolean;
}

export interface LapsedStudyItem {
  kind: 'flashcard' | 'quiz';
  topic: string;
  domainTitle: string;
  lapses: number;
}

export interface ProgressSnapshot {
  activeSection: NavSection;
  dueFlashcards: number;
  totalFlashcards: number;
  reviewedFlashcardsCount: number;
  longTermMasteredCards: number;
  dueQuizQuestions: number;
  totalQuizQuestions: number;
  reviewedQuestionsCount: number;
  reviewedServicesCount: number;
  totalServicesCount: number;
  reviewedServiceNames: string[];
  remainingPriorityServices: string[];
  completedLabsCount: number;
  totalLabsCount: number;
  completedLabTitles: string[];
  remainingLabTitles: string[];
  latestQuizScore: number | null;
  bestQuizScore: number | null;
  recentQuizAttempts: {
    mode: QuizAttemptRecord['mode'];
    domainFilter: DomainId | 'all';
    correctCount: number;
    totalCount: number;
    scaledScore: number;
    dateIso: string;
  }[];
  averageEaseFactor: number | null;
  earliestNextFlashcardDue: string | null;
  earliestNextQuizDue: string | null;
  lapsedItems: LapsedStudyItem[];
  weakestDomain: {
    id: DomainId;
    title: string;
    accuracyPct: number | null;
    dueItems: number;
  } | null;
  domainStats: {
    id: DomainId;
    title: string;
    weight: number;
    quizAccuracyPct: number | null;
    dueFlashcards: number;
    dueQuestions: number;
    reviewedServices: number;
    totalServices: number;
  }[];
  arcadeSummary: {
    level: number;
    rankTitle: string;
    totalXp: number;
    dailyXp: number;
    dailyGoalXp: number;
    streakDays: number;
    bestBlitzScore: number;
    dailyChallengeCompleted: boolean;
  };
  examForecast: {
    scaledForecast: number;
    statusLabel: string;
    deltaToPass: number;
    coveragePct: number;
  };
  activeContext?: ActiveStudyContext;
  recentEvent?: string;
}

export function buildProgressSnapshot(
  progress: StudyProgress,
  activeSection: NavSection,
  activeContext?: ActiveStudyContext,
  recentEvent?: string
): ProgressSnapshot {
  const now = new Date();

  const dueFlashcards = FLASHCARDS.filter((c) =>
    isItemDue(progress.flashcardSrs[c.id], now)
  ).length;
  const reviewedFlashcardsCount = Object.keys(progress.flashcardSrs).length;
  const longTermMasteredCards = FLASHCARDS.filter(
    (c) => (progress.flashcardSrs[c.id]?.intervalDays ?? 0) >= 6
  ).length;
  const dueQuizQuestions = QUIZ_QUESTIONS.filter((q) =>
    isItemDue(progress.quizSrs[q.id], now)
  ).length;
  const reviewedQuestionsCount = Object.keys(progress.quizSrs).length;

  const latestQuizScore =
    progress.quizHistory.length > 0
      ? progress.quizHistory[progress.quizHistory.length - 1].scaledScore
      : null;
  const bestQuizScore =
    progress.quizHistory.length > 0
      ? Math.max(...progress.quizHistory.map((q) => q.scaledScore))
      : null;

  const recentQuizAttempts = progress.quizHistory.slice(-5).map((att) => ({
    mode: att.mode,
    domainFilter: att.domainFilter,
    correctCount: att.correctCount,
    totalCount: att.totalCount,
    scaledScore: att.scaledScore,
    dateIso: att.dateIso,
  }));

  const allSrsEntries = [
    ...Object.values(progress.flashcardSrs),
    ...Object.values(progress.quizSrs),
  ];
  const averageEaseFactor =
    allSrsEntries.length > 0
      ? Math.round(
          (allSrsEntries.reduce((sum, st) => sum + st.easeFactor, 0) /
            allSrsEntries.length) *
            100
        ) / 100
      : null;

  const earliestNextFlashcardDue = getEarliestNextDueLabel(
    progress.flashcardSrs,
    FLASHCARDS.map((c) => c.id),
    now
  );
  const earliestNextQuizDue = getEarliestNextDueLabel(
    progress.quizSrs,
    QUIZ_QUESTIONS.map((q) => q.id),
    now
  );

  const domainTitleById = new Map(EXAM_DOMAINS.map((d) => [d.id, d.title]));

  const domainStats = EXAM_DOMAINS.map((d) => {
    const qs = QUIZ_QUESTIONS.filter((q) => q.domain === d.id);
    const cards = FLASHCARDS.filter((c) => c.domain === d.id);
    const svcs = AWS_SERVICES.filter((s) => s.domain === d.id);

    let attempts = 0;
    let corrects = 0;
    let dDueQuestions = 0;

    qs.forEach((q) => {
      const st = progress.quizSrs[q.id];
      if (isItemDue(st, now)) dDueQuestions += 1;
      if (st) {
        attempts += st.attemptCount;
        corrects += st.correctCount;
      }
    });

    const dDueFlashcards = cards.filter((c) =>
      isItemDue(progress.flashcardSrs[c.id], now)
    ).length;

    const quizAccuracyPct =
      attempts > 0 ? Math.round((corrects / attempts) * 100) : null;

    const reviewedInDomain = svcs.filter((s) =>
      progress.reviewedServices.includes(s.id)
    ).length;

    return {
      id: d.id,
      title: d.title,
      weight: d.weight,
      quizAccuracyPct,
      dueFlashcards: dDueFlashcards,
      dueQuestions: dDueQuestions,
      reviewedServices: reviewedInDomain,
      totalServices: svcs.length,
    };
  });

  // Identify weakest domain by lowest recorded accuracy, or highest due count + exam weight
  const ranked = [...domainStats].sort((a, b) => {
    if (a.quizAccuracyPct !== null && b.quizAccuracyPct !== null) {
      if (a.quizAccuracyPct !== b.quizAccuracyPct) {
        return a.quizAccuracyPct - b.quizAccuracyPct;
      }
    } else if (a.quizAccuracyPct !== null && b.quizAccuracyPct === null) {
      return a.quizAccuracyPct < 75 ? -1 : 1;
    } else if (a.quizAccuracyPct === null && b.quizAccuracyPct !== null) {
      return b.quizAccuracyPct < 75 ? 1 : -1;
    }
    const dueA = a.dueFlashcards + a.dueQuestions;
    const dueB = b.dueFlashcards + b.dueQuestions;
    if (dueA !== dueB) return dueB - dueA;
    return b.weight - a.weight;
  });

  const weakest = ranked[0]
    ? {
        id: ranked[0].id,
        title: ranked[0].title,
        accuracyPct: ranked[0].quizAccuracyPct,
        dueItems: ranked[0].dueFlashcards + ranked[0].dueQuestions,
      }
    : null;

  // Reviewed & remaining priority services (prioritizing weakest domain first)
  const reviewedServiceNames = AWS_SERVICES.filter((s) =>
    progress.reviewedServices.includes(s.id)
  ).map((s) => s.shortName);

  const unreviewedServices = AWS_SERVICES.filter(
    (s) => !progress.reviewedServices.includes(s.id)
  ).sort((a, b) => {
    const aWeak = weakest && a.domain === weakest.id ? 0 : 1;
    const bWeak = weakest && b.domain === weakest.id ? 0 : 1;
    return aWeak - bWeak;
  });
  const remainingPriorityServices = unreviewedServices
    .slice(0, 6)
    .map((s) => s.shortName);

  const completedLabTitles = PRACTICE_SCENARIOS.filter((sc) =>
    progress.completedScenarios.includes(sc.id)
  ).map((sc) => sc.title);
  const remainingLabTitles = PRACTICE_SCENARIOS.filter(
    (sc) => !progress.completedScenarios.includes(sc.id)
  ).map((sc) => sc.title);

  // Collect recently lapsed/missed flashcards & quiz questions (topics only, no answer spoilers)
  const lapsedItems: LapsedStudyItem[] = [];
  QUIZ_QUESTIONS.forEach((q) => {
    const st = progress.quizSrs[q.id];
    if (st && (st.lapses > 0 || st.lastGrade === 'again')) {
      lapsedItems.push({
        kind: 'quiz',
        topic: q.question.slice(0, 140),
        domainTitle: domainTitleById.get(q.domain) || q.domain,
        lapses: Math.max(1, st.lapses),
      });
    }
  });
  FLASHCARDS.forEach((c) => {
    const st = progress.flashcardSrs[c.id];
    if (st && (st.lapses > 0 || st.lastGrade === 'again')) {
      lapsedItems.push({
        kind: 'flashcard',
        topic: c.front.slice(0, 140),
        domainTitle: domainTitleById.get(c.domain) || c.domain,
        lapses: Math.max(1, st.lapses),
      });
    }
  });
  lapsedItems.sort((a, b) => b.lapses - a.lapses);

  const rank = getCloudRank(progress.arcade?.xp ?? 0);
  const readiness = computeExamReadiness(progress);
  const dailyChallenge = getDailyChallengeStatus(progress.arcade);

  return {
    activeSection,
    dueFlashcards,
    totalFlashcards: FLASHCARDS.length,
    reviewedFlashcardsCount,
    longTermMasteredCards,
    dueQuizQuestions,
    totalQuizQuestions: QUIZ_QUESTIONS.length,
    reviewedQuestionsCount,
    reviewedServicesCount: progress.reviewedServices.length,
    totalServicesCount: AWS_SERVICES.length,
    reviewedServiceNames,
    remainingPriorityServices,
    completedLabsCount: progress.completedScenarios.length,
    totalLabsCount: PRACTICE_SCENARIOS.length,
    completedLabTitles,
    remainingLabTitles,
    latestQuizScore,
    bestQuizScore,
    recentQuizAttempts,
    averageEaseFactor,
    earliestNextFlashcardDue,
    earliestNextQuizDue,
    lapsedItems: lapsedItems.slice(0, 6),
    weakestDomain: weakest,
    domainStats,
    arcadeSummary: {
      level: rank.level,
      rankTitle: rank.title,
      totalXp: rank.currentXp,
      dailyXp: getEffectiveDailyXp(progress.arcade),
      dailyGoalXp: DAILY_XP_GOAL,
      streakDays: getEffectiveStreakDays(progress.arcade),
      bestBlitzScore: progress.arcade?.bestBlitzScore ?? 0,
      dailyChallengeCompleted: dailyChallenge.completed,
    },
    examForecast: {
      scaledForecast: readiness.scaledForecast,
      statusLabel: readiness.statusLabel,
      deltaToPass: readiness.deltaToPass,
      coveragePct: readiness.coveragePct,
    },
    activeContext,
    recentEvent,
  };
}
