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
  completedPlanSteps: string[];
  updatedAtIso: string;
}

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const randomPart = Math.random().toString(36).slice(2, 14).padEnd(12, '0');
  return `sess_${Date.now().toString(36)}_${randomPart}`;
}

export function isValidCoachSessionId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{16,64}$/.test(id);
}

export function getOrCreateCoachSessionId(): string {
  if (typeof window === 'undefined') return 'ssr_session_placeholder_01';
  try {
    const existing = window.sessionStorage.getItem(ACTIVE_SESSION_ID_KEY);
    if (isValidCoachSessionId(existing)) {
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
    sessionId: isValidCoachSessionId(sessionId) ? sessionId : generateSessionId(),
    briefing: null,
    hintData: null,
    hintContextKey: '',
    chatMessages: [],
    completedPlanSteps: [],
    updatedAtIso: new Date().toISOString(),
  };
}

export function sanitizeCoachSession(raw: Partial<CoachSessionState> | null | undefined, fallbackSessionId: string): CoachSessionState {
  if (!raw || typeof raw !== 'object') {
    return createEmptyCoachSession(fallbackSessionId);
  }

  const sessionId = isValidCoachSessionId(raw.sessionId)
    ? raw.sessionId
    : isValidCoachSessionId(fallbackSessionId)
    ? fallbackSessionId
    : generateSessionId();

  const validBriefing =
    raw.briefing &&
    typeof raw.briefing === 'object' &&
    typeof raw.briefing.headline === 'string' &&
    typeof raw.briefing.progressUpdate === 'string' &&
    Array.isArray(raw.briefing.pertinentFacts)
      ? raw.briefing
      : null;

  const validHint =
    raw.hintData &&
    typeof raw.hintData === 'object' &&
    typeof raw.hintData.hint === 'string' &&
    typeof raw.hintData.examRule === 'string'
      ? raw.hintData
      : null;

  const validChat = Array.isArray(raw.chatMessages)
    ? raw.chatMessages
        .filter(
          (m): m is ChatMessage =>
            Boolean(m) &&
            typeof m === 'object' &&
            typeof m.id === 'string' &&
            (m.role === 'user' || m.role === 'model') &&
            typeof m.text === 'string'
        )
        .slice(-40)
    : [];

  const validSteps = Array.isArray(raw.completedPlanSteps)
    ? Array.from(
        new Set(
          raw.completedPlanSteps
            .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
            .map((s) => s.trim().slice(0, 120))
        )
      ).slice(0, 12)
    : [];

  return {
    sessionId,
    briefing: validBriefing,
    hintData: validHint,
    hintContextKey: typeof raw.hintContextKey === 'string' ? raw.hintContextKey.slice(0, 200) : '',
    chatMessages: validChat,
    completedPlanSteps: validSteps,
    updatedAtIso:
      typeof raw.updatedAtIso === 'string' && raw.updatedAtIso.length >= 10
        ? raw.updatedAtIso.slice(0, 40)
        : new Date().toISOString(),
  };
}

export function mergeCoachSessions(
  local: CoachSessionState,
  remoteData: Record<string, unknown> | null
): CoachSessionState {
  if (!remoteData) return local;
  const remote = sanitizeCoachSession(remoteData as Partial<CoachSessionState>, local.sessionId);

  const localHasActivity =
    Boolean(local.briefing) ||
    Boolean(local.hintData) ||
    local.chatMessages.length > 0 ||
    local.completedPlanSteps.length > 0;

  const remoteHasActivity =
    Boolean(remote.briefing) ||
    Boolean(remote.hintData) ||
    remote.chatMessages.length > 0 ||
    remote.completedPlanSteps.length > 0;

  if (!localHasActivity && remoteHasActivity) {
    return remote;
  }
  if (!remoteHasActivity && localHasActivity) {
    if (local.sessionId !== remote.sessionId && remote.updatedAtIso > local.updatedAtIso) {
      return remote;
    }
    return local;
  }

  // Both have activity (or neither does): reconcile based on sessionId & updatedAtIso
  if (local.sessionId !== remote.sessionId) {
    return remote.updatedAtIso >= local.updatedAtIso ? remote : local;
  }

  const remoteNewer = remote.updatedAtIso >= local.updatedAtIso;
  const msgMap = new Map<string, ChatMessage>();
  const ordered = remoteNewer
    ? [...local.chatMessages, ...remote.chatMessages]
    : [...remote.chatMessages, ...local.chatMessages];
  for (const m of ordered) {
    msgMap.set(m.id, m);
  }

  const mergedSteps = Array.from(
    new Set([...remote.completedPlanSteps, ...local.completedPlanSteps])
  ).slice(0, 12);

  return {
    sessionId: remote.sessionId,
    briefing: remoteNewer
      ? remote.briefing ?? local.briefing
      : local.briefing ?? remote.briefing,
    hintData: remoteNewer
      ? remote.hintData ?? local.hintData
      : local.hintData ?? remote.hintData,
    hintContextKey: remoteNewer
      ? remote.hintContextKey || local.hintContextKey
      : local.hintContextKey || remote.hintContextKey,
    chatMessages: Array.from(msgMap.values()).slice(-40),
    completedPlanSteps: mergedSteps,
    updatedAtIso: remoteNewer ? remote.updatedAtIso : local.updatedAtIso,
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

    return sanitizeCoachSession(parsed, sessionId);
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
      completedPlanSteps: state.completedPlanSteps.slice(0, 12),
    };
    window.sessionStorage.setItem(ACTIVE_SESSION_ID_KEY, bounded.sessionId);
    window.sessionStorage.setItem(
      `${SESSION_DATA_PREFIX}${bounded.sessionId}`,
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
