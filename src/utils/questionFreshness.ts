import { DomainId, QuizQuestion, SrsItemState } from '../data/types';

const RECENT_QUESTIONS_KEY = 'cloudprep_recent_question_ids_v1';
const RECENT_AI_STEMS_KEY = 'cloudprep_recent_ai_stems_v1';
const MAX_RECENT_QUESTION_IDS = 80;
const MAX_RECENT_AI_STEMS = 35;

function randomIndex(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  try {
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return buf[0] % maxExclusive;
    }
  } catch {
    // Fallback to Math.random
  }
  return Math.floor(Math.random() * maxExclusive);
}

export function cryptoShuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function loadRecentQuestionIds(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_QUESTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string').slice(-MAX_RECENT_QUESTION_IDS);
  } catch {
    return [];
  }
}

export function markQuestionsSeen(ids: string[]): void {
  if (ids.length === 0) return;
  try {
    const existing = loadRecentQuestionIds();
    const filtered = existing.filter((id) => !ids.includes(id));
    const next = [...filtered, ...ids].slice(-MAX_RECENT_QUESTION_IDS);
    window.localStorage.setItem(RECENT_QUESTIONS_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota issues gracefully
  }
}

export function loadRecentAiStems(): string[] {
  try {
    const raw = window.sessionStorage.getItem(RECENT_AI_STEMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === 'string').slice(-MAX_RECENT_AI_STEMS);
  } catch {
    return [];
  }
}

export function recordRecentAiStems(stems: string[]): void {
  if (stems.length === 0) return;
  try {
    const existing = loadRecentAiStems();
    const cleaned = stems
      .map((s) => s.trim().slice(0, 120))
      .filter((s) => s.length >= 10);
    const merged = Array.from(new Set([...existing, ...cleaned])).slice(-MAX_RECENT_AI_STEMS);
    window.sessionStorage.setItem(RECENT_AI_STEMS_KEY, JSON.stringify(merged));
  } catch {
    // Ignore session storage errors gracefully
  }
}

/**
 * Permutes answer options for a QuizQuestion and cleanly remaps correctIndices
 * so repeat learners test actual AWS conceptual knowledge instead of memorizing slot letters.
 */
export function shuffleQuizQuestionOptions(question: QuizQuestion): QuizQuestion {
  const optionCount = question.options.length;
  if (optionCount <= 1) return question;

  const permutation = cryptoShuffle(Array.from({ length: optionCount }, (_, idx) => idx));
  const remappedOptions = permutation.map((oldIdx) => question.options[oldIdx]);
  const remappedCorrect = question.correctIndices
    .map((oldCorrectIdx) => permutation.indexOf(oldCorrectIdx))
    .filter((idx) => idx >= 0)
    .sort((a, b) => a - b);

  // Guard against any unexpected index mismatch
  if (remappedCorrect.length !== question.correctIndices.length) {
    return question;
  }

  return {
    ...question,
    options: remappedOptions,
    correctIndices: remappedCorrect,
  };
}

/**
 * Selects questions prioritizing unseen or least-recently-seen items first,
 * avoiding consecutive quiz repeats while preserving randomness within priority tiers.
 */
export function selectFreshQuestions(
  pool: QuizQuestion[],
  count: number,
  srsMap?: Record<string, SrsItemState>
): QuizQuestion[] {
  if (pool.length === 0) return [];
  const recentIds = loadRecentQuestionIds();
  const recencyIndex = new Map<string, number>();
  recentIds.forEach((id, idx) => recencyIndex.set(id, idx));

  const neverSeenInSrsOrRecent: QuizQuestion[] = [];
  const notRecentlySeen: QuizQuestion[] = [];
  const recentlySeen: { q: QuizQuestion; recency: number }[] = [];

  for (const q of pool) {
    const recency = recencyIndex.get(q.id);
    if (recency === undefined) {
      if (srsMap && !srsMap[q.id]) {
        neverSeenInSrsOrRecent.push(q);
      } else {
        notRecentlySeen.push(q);
      }
    } else {
      recentlySeen.push({ q, recency });
    }
  }

  // Order recently seen from oldest to newest so we cycle the full bank before repeating
  recentlySeen.sort((a, b) => a.recency - b.recency);

  const ordered = [
    ...cryptoShuffle(neverSeenInSrsOrRecent),
    ...cryptoShuffle(notRecentlySeen),
    ...recentlySeen.map((item) => item.q),
  ];

  const picked = ordered.slice(0, Math.min(count, ordered.length));
  markQuestionsSeen(picked.map((q) => q.id));
  return picked.map(shuffleQuizQuestionOptions);
}

export function countUnseenQuestions(
  pool: QuizQuestion[],
  srsMap: Record<string, SrsItemState>
): number {
  const recent = new Set(loadRecentQuestionIds());
  return pool.filter((q) => !srsMap[q.id] && !recent.has(q.id)).length;
}

export interface FreshQuestionsRequest {
  sessionId: string;
  domainFilter: DomainId | 'all';
  count: number;
  excludeStems: string[];
  signal?: AbortSignal;
}

export async function fetchFreshAiQuestions({
  sessionId,
  domainFilter,
  count,
  excludeStems,
  signal,
}: FreshQuestionsRequest): Promise<QuizQuestion[]> {
  const response = await fetch(`/api/questions/fresh?_t=${Date.now()}`, {
    method: 'POST',
    cache: 'no-store',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store',
    },
    body: JSON.stringify({
      sessionId,
      domainFilter,
      count,
      excludeStems: excludeStems.slice(-35),
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    questions?: QuizQuestion[];
  };

  if (!response.ok) {
    throw new Error(
      payload.error || 'Could not generate fresh practice questions right now. Please try again.'
    );
  }

  if (!Array.isArray(payload.questions) || payload.questions.length === 0) {
    throw new Error('No fresh questions were returned. Please try again.');
  }

  recordRecentAiStems(payload.questions.map((q) => q.question));
  return payload.questions.map(shuffleQuizQuestionOptions);
}
