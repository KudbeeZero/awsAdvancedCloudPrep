import { DomainId, NavSection } from '../data/types';

const ACTIVE_SESSION_ID_KEY = 'cloudprep_coach_active_session_id_v1';
const SESSION_DATA_PREFIX = 'cloudprep_coach_session_data_v1_';

export interface StudyPlanStep {
  stepTitle: string;
  reason: string;
  section: NavSection;
  domain?: DomainId | 'all';
  durationLabel: string;
}

export interface BriefingData {
  headline: string;
  progressUpdate: string;
  readinessVerdict?: string;
  pertinentFacts: string[];
  studyPlan?: StudyPlanStep[];
  recommendedActionLabel: string;
  recommendedSection: NavSection;
  recommendedDomain?: DomainId | 'all';
}

export interface HintData {
  hint: string;
  deeperClue?: string;
  examRule: string;
  distractorWatchout?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  followUps?: string[];
}

export interface CoachSessionState {
  sessionId: string;
  briefing: BriefingData | null;
  hintData: HintData | null;
  hintContextKey: string;
  chatMessages: ChatMessage[];
  updatedAtIso: string;
}

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const randomPart = Math.random().toString(36).slice(2, 12);
  return `sess_${Date.now().toString(36)}_${randomPart}`;
}

export function getOrCreateCoachSessionId(): string {
  if (typeof window === 'undefined') return 'ssr-session-placeholder';
  try {
    const existing = window.sessionStorage.getItem(ACTIVE_SESSION_ID_KEY);
    if (existing && /^[a-zA-Z0-9_-]{16,64}$/.test(existing)) {
      return existing;
    }
    const fresh = generateSessionId();
    window.sessionStorage.setItem(ACTIVE_SESSION_ID_KEY, fresh);
    return fresh;
  } catch {
    return generateSessionId();
  }
}

export function createEmptyCoachSession(sessionId: string): CoachSessionState {
  return {
    sessionId,
    briefing: null,
    hintData: null,
    hintContextKey: '',
    chatMessages: [],
    updatedAtIso: new Date().toISOString(),
  };
}

export function loadCoachSessionState(sessionId: string): CoachSessionState {
  if (typeof window === 'undefined') {
    return createEmptyCoachSession(sessionId);
  }
  try {
    const raw = window.sessionStorage.getItem(`${SESSION_DATA_PREFIX}${sessionId}`);
    if (!raw) return createEmptyCoachSession(sessionId);

    const parsed = JSON.parse(raw) as Partial<CoachSessionState>;
    if (parsed.sessionId !== sessionId) {
      return createEmptyCoachSession(sessionId);
    }

    const validBriefing =
      parsed.briefing &&
      typeof parsed.briefing.headline === 'string' &&
      typeof parsed.briefing.progressUpdate === 'string' &&
      Array.isArray(parsed.briefing.pertinentFacts)
        ? parsed.briefing
        : null;

    const validHint =
      parsed.hintData &&
      typeof parsed.hintData.hint === 'string' &&
      typeof parsed.hintData.examRule === 'string'
        ? parsed.hintData
        : null;

    const validChat = Array.isArray(parsed.chatMessages)
      ? parsed.chatMessages
          .filter(
            (m): m is ChatMessage =>
              Boolean(m) &&
              typeof m.id === 'string' &&
              (m.role === 'user' || m.role === 'model') &&
              typeof m.text === 'string'
          )
          .slice(-40)
      : [];

    return {
      sessionId,
      briefing: validBriefing,
      hintData: validHint,
      hintContextKey: typeof parsed.hintContextKey === 'string' ? parsed.hintContextKey : '',
      chatMessages: validChat,
      updatedAtIso:
        typeof parsed.updatedAtIso === 'string' ? parsed.updatedAtIso : new Date().toISOString(),
    };
  } catch {
    return createEmptyCoachSession(sessionId);
  }
}

export function saveCoachSessionState(state: CoachSessionState): void {
  if (typeof window === 'undefined') return;
  try {
    const bounded: CoachSessionState = {
      ...state,
      chatMessages: state.chatMessages.slice(-40),
      updatedAtIso: new Date().toISOString(),
    };
    window.sessionStorage.setItem(
      `${SESSION_DATA_PREFIX}${state.sessionId}`,
      JSON.stringify(bounded)
    );
  } catch {
    // Ignore storage quota issues gracefully
  }
}

export function rotateCoachSession(oldSessionId: string): CoachSessionState {
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(`${SESSION_DATA_PREFIX}${oldSessionId}`);
      const freshId = generateSessionId();
      window.sessionStorage.setItem(ACTIVE_SESSION_ID_KEY, freshId);
      return createEmptyCoachSession(freshId);
    } catch {
      // Fallback below
    }
  }
  return createEmptyCoachSession(generateSessionId());
}
