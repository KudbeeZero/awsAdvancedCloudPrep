import { FlashcardConfidence, SrsGrade, SrsItemState } from '../data/types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MIN_EASE_FACTOR = 1.3;
const DEFAULT_EASE_FACTOR = 2.5;

const GRADE_QUALITY: Record<SrsGrade, number> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

/**
 * Computes the next SM-2 Spaced Repetition state for an item given a user's recall grade.
 * - 'again' resets repetitions and schedules immediate re-review (intervalDays = 0).
 * - 'hard', 'good', 'easy' increase review intervals progressively as ease & repetitions grow.
 */
export function computeNextSrsState(
  prev: SrsItemState | undefined,
  grade: SrsGrade,
  now: Date = new Date()
): SrsItemState {
  const quality = GRADE_QUALITY[grade];
  const prevReps = prev?.repetitions ?? 0;
  const prevInterval = prev?.intervalDays ?? 0;
  const prevEase = prev?.easeFactor ?? DEFAULT_EASE_FACTOR;
  const prevLapses = prev?.lapses ?? 0;
  const prevCorrect = prev?.correctCount ?? 0;
  const prevAttempts = prev?.attemptCount ?? 0;

  let nextReps = prevReps;
  let nextIntervalDays = prevInterval;
  let nextLapses = prevLapses;

  if (quality < 3) {
    // Recall failed -> reset streak, re-queue immediately
    nextReps = 0;
    nextIntervalDays = 0;
    nextLapses = prevLapses + 1;
  } else {
    if (grade === 'hard') {
      if (prevReps === 0) {
        nextIntervalDays = 1;
      } else {
        nextIntervalDays = Math.max(prevInterval + 1, Math.round(prevInterval * 1.2));
      }
      nextReps = prevReps + 1;
    } else if (grade === 'good') {
      if (prevReps === 0) {
        nextIntervalDays = 1;
      } else if (prevReps === 1) {
        nextIntervalDays = 6;
      } else {
        nextIntervalDays = Math.max(prevInterval + 1, Math.round(prevInterval * prevEase));
      }
      nextReps = prevReps + 1;
    } else {
      // 'easy'
      if (prevReps === 0) {
        nextIntervalDays = 4;
      } else if (prevReps === 1) {
        nextIntervalDays = 8;
      } else {
        nextIntervalDays = Math.max(
          prevInterval + 2,
          Math.round(prevInterval * prevEase * 1.3)
        );
      }
      nextReps = prevReps + 1;
    }
  }

  // Standard SM-2 ease factor update
  const rawEase =
    prevEase + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  const nextEase = Math.round(Math.max(MIN_EASE_FACTOR, rawEase) * 100) / 100;

  const dueMs =
    nextIntervalDays === 0
      ? now.getTime()
      : now.getTime() + nextIntervalDays * MS_PER_DAY;

  return {
    repetitions: nextReps,
    intervalDays: nextIntervalDays,
    easeFactor: nextEase,
    dueAtIso: new Date(dueMs).toISOString(),
    lastReviewedIso: now.toISOString(),
    lastGrade: grade,
    lapses: nextLapses,
    correctCount: prevCorrect + (quality >= 3 ? 1 : 0),
    attemptCount: prevAttempts + 1,
  };
}

export function previewNextIntervals(
  prev: SrsItemState | undefined,
  now: Date = new Date()
): Record<SrsGrade, string> {
  return {
    again: formatIntervalLabel(computeNextSrsState(prev, 'again', now).intervalDays),
    hard: formatIntervalLabel(computeNextSrsState(prev, 'hard', now).intervalDays),
    good: formatIntervalLabel(computeNextSrsState(prev, 'good', now).intervalDays),
    easy: formatIntervalLabel(computeNextSrsState(prev, 'easy', now).intervalDays),
  };
}

export function formatIntervalLabel(days: number): string {
  if (days <= 0) return 'Now';
  if (days === 1) return '1d';
  if (days < 30) return `${days}d`;
  const months = Math.round((days / 30) * 10) / 10;
  return `${months}mo`;
}

export function isItemDue(
  state: SrsItemState | undefined,
  now: Date = new Date()
): boolean {
  if (!state) return true; // Never studied = ready/due for first review
  return new Date(state.dueAtIso).getTime() <= now.getTime();
}

export function isItemScheduledFuture(
  state: SrsItemState | undefined,
  now: Date = new Date()
): boolean {
  if (!state) return false;
  return new Date(state.dueAtIso).getTime() > now.getTime();
}

export function formatDueStatus(
  state: SrsItemState | undefined,
  now: Date = new Date()
): string {
  if (!state) return 'New · Not yet reviewed';
  const diffMs = new Date(state.dueAtIso).getTime() - now.getTime();
  if (diffMs <= 0) {
    return state.lastGrade === 'again'
      ? `Due now · Missed last recall`
      : `Due now · Interval was ${formatIntervalLabel(state.intervalDays)}`;
  }
  const daysLeft = Math.ceil(diffMs / MS_PER_DAY);
  return `Next review in ${formatIntervalLabel(daysLeft)} · Streak ${state.repetitions}`;
}

export function deriveConfidenceFromSrs(
  state: SrsItemState | undefined
): FlashcardConfidence | undefined {
  if (!state) return undefined;
  if (state.lastGrade === 'again' || state.repetitions === 0) return 'review';
  if (state.intervalDays >= 6 && state.repetitions >= 2) return 'mastered';
  return 'familiar';
}

export function getEarliestNextDueLabel(
  states: Record<string, SrsItemState>,
  itemIds: string[],
  now: Date = new Date()
): string | null {
  let earliestMs: number | null = null;
  for (const id of itemIds) {
    const st = states[id];
    if (!st) continue;
    const dueMs = new Date(st.dueAtIso).getTime();
    if (dueMs > now.getTime() && (earliestMs === null || dueMs < earliestMs)) {
      earliestMs = dueMs;
    }
  }
  if (earliestMs === null) return null;
  const days = Math.max(1, Math.ceil((earliestMs - now.getTime()) / MS_PER_DAY));
  return formatIntervalLabel(days);
}
