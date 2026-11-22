import { User } from 'firebase/auth';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  ArcadeStats,
  DomainId,
  FlashcardConfidence,
  QuizAttemptRecord,
  SrsItemState,
  StudyProgress,
} from '../data/types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  BriefingData,
  ChatMessage,
  CoachSessionState,
  HintData,
  isValidCoachSessionId,
  sanitizeCoachSession,
} from './coachSession';

const VALID_MODES = new Set<QuizAttemptRecord['mode']>([
  'drill',
  'practice',
  'mock',
  'srs',
  'blitz',
]);

const VALID_DOMAINS = new Set<QuizAttemptRecord['domainFilter']>([
  'all',
  'domain-1',
  'domain-2',
  'domain-3',
  'domain-4',
]);

function clampInt(value: unknown, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.floor(value)));
}

function sanitizeIdList(items: string[], maxItems: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (typeof item === 'string' && item.length >= 1 && item.length <= 64 && !seen.has(item)) {
      seen.add(item);
      out.push(item);
      if (out.length >= maxItems) break;
    }
  }
  return out;
}

function sanitizeDateString(val: unknown): string {
  return typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : '';
}

function sanitizeDailyXpHistory(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const entries = Object.entries(raw)
    .filter(([k]) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 60);
  for (const [k, v] of entries) {
    out[k] = clampInt(v, 100_000);
  }
  return out;
}

function sanitizeArcade(arcade: ArcadeStats): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    xp: clampInt(arcade.xp, 1_000_000),
    bestBlitzScore: clampInt(arcade.bestBlitzScore, 1_000_000),
    bestSurvivalStreak: clampInt(arcade.bestSurvivalStreak, 5000),
    longestCombo: clampInt(arcade.longestCombo, 5000),
    gamesPlayed: clampInt(arcade.gamesPlayed, 100_000),
    streakDays: clampInt(arcade.streakDays, 10_000),
    lastActiveDate: sanitizeDateString(arcade.lastActiveDate),
    dailyXp: clampInt(arcade.dailyXp, 100_000),
    dailyDate: sanitizeDateString(arcade.dailyDate),
    dailyXpHistory: sanitizeDailyXpHistory(arcade.dailyXpHistory),
  };
  const bonusDate = sanitizeDateString(arcade.dailyGoalBonusDate);
  if (bonusDate) {
    payload.dailyGoalBonusDate = bonusDate;
  }
  const challengeDate = sanitizeDateString(arcade.dailyChallengeDate);
  if (challengeDate) {
    payload.dailyChallengeDate = challengeDate;
    payload.dailyChallengeScore = clampInt(arcade.dailyChallengeScore, 100_000);
    payload.dailyChallengeCorrect = clampInt(arcade.dailyChallengeCorrect, 20);
    payload.dailyChallengeTotal = Math.max(1, clampInt(arcade.dailyChallengeTotal, 20));
  }
  return payload;
}

function sanitizeMap<T>(record: Record<string, T>, maxKeys: number): Record<string, T> {
  const out: Record<string, T> = {};
  let count = 0;
  for (const [key, val] of Object.entries(record)) {
    if (
      key.length >= 1 &&
      key.length <= 64 &&
      key !== '__proto__' &&
      key !== 'constructor' &&
      key !== 'prototype' &&
      val !== undefined &&
      val !== null
    ) {
      out[key] = val;
      count += 1;
      if (count >= maxKeys) break;
    }
  }
  return out;
}

function sanitizeDocId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : `att_${Date.now()}`;
}

export function serializeProgressForFirestore(uid: string, progress: StudyProgress) {
  return {
    uid,
    reviewedServices: sanitizeIdList(progress.reviewedServices, 200),
    completedScenarios: sanitizeIdList(progress.completedScenarios, 100),
    perfectScenarios: sanitizeIdList(progress.perfectScenarios, 100),
    claimedAchievements: sanitizeIdList(progress.claimedAchievements, 50),
    flashcardConfidence: sanitizeMap<FlashcardConfidence>(progress.flashcardConfidence, 250),
    flashcardSrs: sanitizeMap<SrsItemState>(progress.flashcardSrs, 250),
    quizSrs: sanitizeMap<SrsItemState>(progress.quizSrs, 300),
    arcade: sanitizeArcade(progress.arcade),
  };
}

function mergeSrsMaps(
  local: Record<string, SrsItemState>,
  remote: Record<string, SrsItemState>,
  maxKeys: number
): Record<string, SrsItemState> {
  const merged: Record<string, SrsItemState> = { ...remote };
  for (const [id, localItem] of Object.entries(local)) {
    const remoteItem = merged[id];
    if (!remoteItem) {
      merged[id] = localItem;
    } else if (
      localItem.attemptCount > remoteItem.attemptCount ||
      localItem.lastReviewedIso > remoteItem.lastReviewedIso
    ) {
      merged[id] = localItem;
    }
  }
  return sanitizeMap(merged, maxKeys);
}

export function mergeStudyProgress(
  local: StudyProgress,
  remoteData: Record<string, unknown> | null,
  remoteAttempts: QuizAttemptRecord[]
): StudyProgress {
  const remote = (remoteData || {}) as Partial<StudyProgress>;
  const remoteArcade = (remote.arcade || {}) as Partial<ArcadeStats>;

  const reviewedServices = sanitizeIdList(
    [...(remote.reviewedServices || []), ...local.reviewedServices],
    200
  );
  const completedScenarios = sanitizeIdList(
    [...(remote.completedScenarios || []), ...local.completedScenarios],
    100
  );
  const perfectScenarios = sanitizeIdList(
    [...(remote.perfectScenarios || []), ...local.perfectScenarios],
    100
  );
  const claimedAchievements = sanitizeIdList(
    [...(remote.claimedAchievements || []), ...local.claimedAchievements],
    50
  );

  const flashcardSrs = mergeSrsMaps(local.flashcardSrs, remote.flashcardSrs || {}, 250);
  const quizSrs = mergeSrsMaps(local.quizSrs, remote.quizSrs || {}, 300);

  const flashcardConfidence = sanitizeMap<FlashcardConfidence>(
    { ...(remote.flashcardConfidence || {}), ...local.flashcardConfidence },
    250
  );

  const attemptById = new Map<string, QuizAttemptRecord>();
  for (const att of [...remoteAttempts, ...local.quizHistory]) {
    if (att && typeof att.id === 'string') {
      attemptById.set(att.id, att);
    }
  }
  const mergedHistory = Array.from(attemptById.values())
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso))
    .slice(-100);

  const localLastActive = sanitizeDateString(local.arcade.lastActiveDate);
  const remoteLastActive = sanitizeDateString(remoteArcade.lastActiveDate);
  const latestActiveDate =
    localLastActive >= remoteLastActive ? localLastActive : remoteLastActive;

  const localDailyDate = sanitizeDateString(local.arcade.dailyDate);
  const remoteDailyDate = sanitizeDateString(remoteArcade.dailyDate);
  const latestDailyDate =
    localDailyDate >= remoteDailyDate ? localDailyDate : remoteDailyDate;

  let mergedDailyXp = 0;
  if (localDailyDate === latestDailyDate && remoteDailyDate === latestDailyDate) {
    mergedDailyXp = Math.max(local.arcade.dailyXp, clampInt(remoteArcade.dailyXp, 100_000));
  } else if (localDailyDate === latestDailyDate) {
    mergedDailyXp = local.arcade.dailyXp;
  } else {
    mergedDailyXp = clampInt(remoteArcade.dailyXp, 100_000);
  }

  const bonusDate =
    sanitizeDateString(local.arcade.dailyGoalBonusDate) ||
    sanitizeDateString(remoteArcade.dailyGoalBonusDate) ||
    undefined;

  const localHist = sanitizeDailyXpHistory(local.arcade.dailyXpHistory);
  const remoteHist = sanitizeDailyXpHistory(remoteArcade.dailyXpHistory);
  const mergedHistoryKeys = new Set([...Object.keys(localHist), ...Object.keys(remoteHist)]);
  const mergedDailyXpHistory: Record<string, number> = {};
  Array.from(mergedHistoryKeys)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 60)
    .forEach((k) => {
      mergedDailyXpHistory[k] = Math.max(localHist[k] || 0, remoteHist[k] || 0);
    });

  const localChallengeDate = sanitizeDateString(local.arcade.dailyChallengeDate);
  const remoteChallengeDate = sanitizeDateString(remoteArcade.dailyChallengeDate);
  const latestChallengeDate =
    localChallengeDate >= remoteChallengeDate ? localChallengeDate : remoteChallengeDate;

  let mergedChallengeScore: number | undefined;
  let mergedChallengeCorrect: number | undefined;
  let mergedChallengeTotal: number | undefined;
  if (latestChallengeDate) {
    if (
      localChallengeDate === latestChallengeDate &&
      remoteChallengeDate === latestChallengeDate
    ) {
      mergedChallengeScore = Math.max(
        clampInt(local.arcade.dailyChallengeScore, 100_000),
        clampInt(remoteArcade.dailyChallengeScore, 100_000)
      );
      mergedChallengeCorrect = Math.max(
        clampInt(local.arcade.dailyChallengeCorrect, 20),
        clampInt(remoteArcade.dailyChallengeCorrect, 20)
      );
      mergedChallengeTotal = Math.max(
        1,
        clampInt(local.arcade.dailyChallengeTotal, 20),
        clampInt(remoteArcade.dailyChallengeTotal, 20)
      );
    } else if (localChallengeDate === latestChallengeDate) {
      mergedChallengeScore = clampInt(local.arcade.dailyChallengeScore, 100_000);
      mergedChallengeCorrect = clampInt(local.arcade.dailyChallengeCorrect, 20);
      mergedChallengeTotal = Math.max(1, clampInt(local.arcade.dailyChallengeTotal, 20));
    } else {
      mergedChallengeScore = clampInt(remoteArcade.dailyChallengeScore, 100_000);
      mergedChallengeCorrect = clampInt(remoteArcade.dailyChallengeCorrect, 20);
      mergedChallengeTotal = Math.max(1, clampInt(remoteArcade.dailyChallengeTotal, 20));
    }
  }

  return {
    reviewedServices,
    completedScenarios,
    perfectScenarios,
    claimedAchievements,
    flashcardConfidence,
    flashcardSrs,
    quizSrs,
    quizHistory: mergedHistory,
    arcade: {
      xp: Math.max(local.arcade.xp, clampInt(remoteArcade.xp, 1_000_000)),
      bestBlitzScore: Math.max(
        local.arcade.bestBlitzScore,
        clampInt(remoteArcade.bestBlitzScore, 1_000_000)
      ),
      bestSurvivalStreak: Math.max(
        local.arcade.bestSurvivalStreak,
        clampInt(remoteArcade.bestSurvivalStreak, 5000)
      ),
      longestCombo: Math.max(
        local.arcade.longestCombo,
        clampInt(remoteArcade.longestCombo, 5000)
      ),
      gamesPlayed: Math.max(
        local.arcade.gamesPlayed,
        clampInt(remoteArcade.gamesPlayed, 100_000)
      ),
      streakDays: Math.max(
        local.arcade.streakDays,
        clampInt(remoteArcade.streakDays, 10_000)
      ),
      lastActiveDate: latestActiveDate,
      dailyXp: mergedDailyXp,
      dailyDate: latestDailyDate,
      dailyGoalBonusDate: bonusDate,
      dailyXpHistory: mergedDailyXpHistory,
      ...(latestChallengeDate
        ? {
            dailyChallengeDate: latestChallengeDate,
            dailyChallengeScore: mergedChallengeScore,
            dailyChallengeCorrect: mergedChallengeCorrect,
            dailyChallengeTotal: mergedChallengeTotal,
          }
        : {}),
    },
  };
}

export async function ensureUserAccountDocs(user: User): Promise<void> {
  if (!user.emailVerified || !user.email) return;

  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  try {
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  const profilePath = `users/${user.uid}/private/profile`;
  const profileRef = doc(db, 'users', user.uid, 'private', 'profile');
  const profileFields: Record<string, unknown> = {
    email: user.email.slice(0, 254),
    updatedAt: serverTimestamp(),
  };
  if (user.displayName && user.displayName.trim()) {
    profileFields.displayName = user.displayName.trim().slice(0, 120);
  }
  if (user.photoURL && user.photoURL.trim()) {
    profileFields.photoUrl = user.photoURL.trim().slice(0, 500);
  }

  try {
    const profileSnap = await getDoc(profileRef);
    if (!profileSnap.exists()) {
      await setDoc(profileRef, {
        uid: user.uid,
        ...profileFields,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(profileRef, profileFields);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, profilePath);
  }
}

export async function loadUserCloudState(uid: string): Promise<{
  progressExists: boolean;
  progressData: Record<string, unknown> | null;
  attempts: QuizAttemptRecord[];
}> {
  const progressPath = `users/${uid}/progress/current`;
  let progressExists = false;
  let progressData: Record<string, unknown> | null = null;

  try {
    const snap = await getDoc(doc(db, 'users', uid, 'progress', 'current'));
    if (snap.exists()) {
      progressExists = true;
      progressData = snap.data() as Record<string, unknown>;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, progressPath);
  }

  const attemptsPath = `users/${uid}/quizAttempts`;
  const attempts: QuizAttemptRecord[] = [];
  try {
    const q = query(
      collection(db, 'users', uid, 'quizAttempts'),
      where('uid', '==', uid),
      limit(100)
    );
    const snap = await getDocs(q);
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const mode = VALID_MODES.has(data.mode) ? (data.mode as QuizAttemptRecord['mode']) : 'practice';
      const domainFilter = VALID_DOMAINS.has(data.domainFilter)
        ? (data.domainFilter as DomainId | 'all')
        : 'all';
      attempts.push({
        id: docSnap.id,
        dateIso: typeof data.dateIso === 'string' ? data.dateIso : new Date().toISOString(),
        mode,
        domainFilter,
        correctCount: clampInt(data.correctCount, 500),
        totalCount: Math.max(1, clampInt(data.totalCount, 500)),
        scaledScore: Math.min(1000, Math.max(100, clampInt(data.scaledScore, 1000))),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, attemptsPath);
  }

  attempts.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  return { progressExists, progressData, attempts };
}

export async function saveUserStudyProgress(
  uid: string,
  progress: StudyProgress,
  docExistsOnServer: boolean
): Promise<boolean> {
  const progressPath = `users/${uid}/progress/current`;
  const progressRef = doc(db, 'users', uid, 'progress', 'current');
  const serialized = serializeProgressForFirestore(uid, progress);

  try {
    if (!docExistsOnServer) {
      await setDoc(progressRef, {
        ...serialized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return true;
    }

    const { uid: _uid, ...mutableFields } = serialized;
    try {
      await updateDoc(progressRef, {
        ...mutableFields,
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (updateErr: unknown) {
      const code =
        updateErr && typeof updateErr === 'object' && 'code' in updateErr
          ? String((updateErr as { code?: unknown }).code)
          : '';
      if (code === 'not-found') {
        await setDoc(progressRef, {
          ...serialized,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return true;
      }
      throw updateErr;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, progressPath);
  }
}

export async function saveQuizAttemptToCloud(
  uid: string,
  attempt: QuizAttemptRecord
): Promise<void> {
  const docId = sanitizeDocId(attempt.id);
  const path = `users/${uid}/quizAttempts/${docId}`;
  const totalCount = Math.max(1, clampInt(attempt.totalCount, 500));
  const correctCount = Math.min(totalCount, clampInt(attempt.correctCount, 500));
  const scaledScore = Math.min(1000, Math.max(100, clampInt(attempt.scaledScore, 1000)));
  const mode = VALID_MODES.has(attempt.mode) ? attempt.mode : 'practice';
  const domainFilter = VALID_DOMAINS.has(attempt.domainFilter) ? attempt.domainFilter : 'all';
  const dateIso =
    typeof attempt.dateIso === 'string' && attempt.dateIso.length >= 10
      ? attempt.dateIso.slice(0, 40)
      : new Date().toISOString();

  try {
    await setDoc(doc(db, 'users', uid, 'quizAttempts', docId), {
      uid,
      mode,
      domainFilter,
      correctCount,
      totalCount,
      scaledScore,
      dateIso,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function resetUserCloudProgress(
  uid: string,
  emptyProgress: StudyProgress,
  progressExists: boolean
): Promise<void> {
  await saveUserStudyProgress(uid, emptyProgress, progressExists);

  const attemptsPath = `users/${uid}/quizAttempts`;
  try {
    const q = query(
      collection(db, 'users', uid, 'quizAttempts'),
      where('uid', '==', uid),
      limit(100)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, attemptsPath);
  }
}

export function subscribeToUserProgress(
  uid: string,
  onRemoteUpdate: (data: Record<string, unknown>) => void,
  onError?: (error: Error) => void
): () => void {
  const path = `users/${uid}/progress/current`;
  const progressRef = doc(db, 'users', uid, 'progress', 'current');
  return onSnapshot(
    progressRef,
    (snap) => {
      if (snap.exists() && !snap.metadata.hasPendingWrites) {
        onRemoteUpdate(snap.data() as Record<string, unknown>);
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (formattedError) {
        if (onError) {
          onError(
            formattedError instanceof Error
              ? formattedError
              : new Error(String(formattedError))
          );
        } else {
          throw formattedError;
        }
      }
    }
  );
}

function sanitizeBriefingForFirestore(briefing: BriefingData): Record<string, unknown> {
  const clean: Record<string, unknown> = {
    headline: briefing.headline.slice(0, 140),
    progressUpdate: briefing.progressUpdate.slice(0, 560),
    pertinentFacts: briefing.pertinentFacts
      .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
      .slice(0, 5)
      .map((f) => f.slice(0, 280)),
    recommendedActionLabel: briefing.recommendedActionLabel.slice(0, 60),
    recommendedSection: briefing.recommendedSection,
  };
  if (typeof briefing.readinessVerdict === 'string' && briefing.readinessVerdict.trim()) {
    clean.readinessVerdict = briefing.readinessVerdict.slice(0, 260);
  }
  if (briefing.recommendedDomain) {
    clean.recommendedDomain = briefing.recommendedDomain;
  }
  if (Array.isArray(briefing.studyPlan) && briefing.studyPlan.length > 0) {
    clean.studyPlan = briefing.studyPlan.slice(0, 6).map((step) => {
      const s: Record<string, unknown> = {
        stepTitle: step.stepTitle.slice(0, 100),
        reason: step.reason.slice(0, 220),
        section: step.section,
        durationLabel: step.durationLabel.slice(0, 32),
      };
      if (step.domain) s.domain = step.domain;
      return s;
    });
  }
  return clean;
}

function sanitizeHintForFirestore(hint: HintData): Record<string, unknown> {
  const clean: Record<string, unknown> = {
    hint: hint.hint.slice(0, 540),
    examRule: hint.examRule.slice(0, 360),
  };
  if (typeof hint.deeperClue === 'string' && hint.deeperClue.trim()) {
    clean.deeperClue = hint.deeperClue.slice(0, 540);
  }
  if (typeof hint.distractorWatchout === 'string' && hint.distractorWatchout.trim()) {
    clean.distractorWatchout = hint.distractorWatchout.slice(0, 320);
  }
  return clean;
}

function sanitizeChatMessagesForFirestore(messages: ChatMessage[]): Record<string, unknown>[] {
  return messages.slice(-40).map((m) => {
    const clean: Record<string, unknown> = {
      id: m.id.slice(0, 64),
      role: m.role === 'user' ? 'user' : 'model',
      text: m.text.slice(0, 2000),
    };
    if (Array.isArray(m.followUps) && m.followUps.length > 0) {
      clean.followUps = m.followUps
        .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
        .slice(0, 3)
        .map((f) => f.slice(0, 120));
    }
    return clean;
  });
}

export function serializeCoachSessionForFirestore(
  uid: string,
  session: CoachSessionState,
  forUpdate = false
): Record<string, unknown> {
  const safe = sanitizeCoachSession(session, session.sessionId);
  const safeSessionId = isValidCoachSessionId(safe.sessionId)
    ? safe.sessionId
    : `sess_${Date.now().toString(36)}_cloudprep`;

  const payload: Record<string, unknown> = {
    ...(forUpdate ? {} : { uid }),
    sessionId: safeSessionId,
    hintContextKey: safe.hintContextKey.slice(0, 200),
    chatMessages: sanitizeChatMessagesForFirestore(safe.chatMessages),
    completedPlanSteps: safe.completedPlanSteps.slice(0, 12).map((s) => s.slice(0, 120)),
    updatedAtIso:
      safe.updatedAtIso.length >= 10 && safe.updatedAtIso.length <= 40
        ? safe.updatedAtIso
        : new Date().toISOString(),
  };

  if (safe.briefing) {
    payload.briefing = sanitizeBriefingForFirestore(safe.briefing);
  } else if (forUpdate) {
    payload.briefing = deleteField();
  }

  if (safe.hintData) {
    payload.hintData = sanitizeHintForFirestore(safe.hintData);
  } else if (forUpdate) {
    payload.hintData = deleteField();
  }

  return payload;
}

export async function loadUserCoachSession(uid: string): Promise<{
  exists: boolean;
  data: Record<string, unknown> | null;
}> {
  const coachPath = `users/${uid}/coach/current`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'coach', 'current'));
    if (snap.exists()) {
      return {
        exists: true,
        data: snap.data() as Record<string, unknown>,
      };
    }
    return { exists: false, data: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, coachPath);
  }
}

export async function saveUserCoachSession(
  uid: string,
  session: CoachSessionState,
  docExistsOnServer: boolean
): Promise<boolean> {
  const coachPath = `users/${uid}/coach/current`;
  const coachRef = doc(db, 'users', uid, 'coach', 'current');

  try {
    if (!docExistsOnServer) {
      const createPayload = serializeCoachSessionForFirestore(uid, session, false);
      await setDoc(coachRef, {
        ...createPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return true;
    }

    const updatePayload = serializeCoachSessionForFirestore(uid, session, true);
    try {
      await updateDoc(coachRef, {
        ...updatePayload,
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (updateErr: unknown) {
      const code =
        updateErr && typeof updateErr === 'object' && 'code' in updateErr
          ? String((updateErr as { code?: unknown }).code)
          : '';
      if (code === 'not-found') {
        const createPayload = serializeCoachSessionForFirestore(uid, session, false);
        await setDoc(coachRef, {
          ...createPayload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return true;
      }
      throw updateErr;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, coachPath);
  }
}

export function subscribeToCoachSession(
  uid: string,
  onRemoteUpdate: (data: Record<string, unknown>) => void,
  onError?: (error: Error) => void
): () => void {
  const path = `users/${uid}/coach/current`;
  const coachRef = doc(db, 'users', uid, 'coach', 'current');
  return onSnapshot(
    coachRef,
    (snap) => {
      if (snap.exists() && !snap.metadata.hasPendingWrites) {
        onRemoteUpdate(snap.data() as Record<string, unknown>);
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (formattedError) {
        if (onError) {
          onError(
            formattedError instanceof Error
              ? formattedError
              : new Error(String(formattedError))
          );
        } else {
          throw formattedError;
        }
      }
    }
  );
}

export interface ServiceAudioRecord {
  serviceId: string;
  title: string;
  audioUrl: string;
  cacheKey: string;
  voiceKey: 'rachel' | 'adam' | 'bella' | 'josh';
  voiceLabel: string;
  scriptText: string;
  scriptProvider: 'deepseek' | 'gemini' | 'curated';
  audioProvider: 'elevenlabs';
  byteLength: number;
}

const VALID_VOICE_KEYS = new Set<ServiceAudioRecord['voiceKey']>([
  'rachel',
  'adam',
  'bella',
  'josh',
]);
const VALID_SCRIPT_PROVIDERS = new Set<ServiceAudioRecord['scriptProvider']>([
  'deepseek',
  'gemini',
  'curated',
]);

function parseServiceAudioDoc(
  docId: string,
  data: Record<string, unknown> | undefined
): ServiceAudioRecord | null {
  if (!data) return null;
  const serviceId =
    typeof data.serviceId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(data.serviceId)
      ? data.serviceId
      : docId;
  const audioUrl = typeof data.audioUrl === 'string' ? data.audioUrl : '';
  const cacheKey = typeof data.cacheKey === 'string' ? data.cacheKey : '';
  if (
    !/^[a-zA-Z0-9_-]{1,64}$/.test(serviceId) ||
    !/^(\/api\/audio\/stream\/[a-f0-9]{16,64}|https:\/\/.+)$/.test(audioUrl) ||
    !/^[a-f0-9]{16,64}$/.test(cacheKey)
  ) {
    return null;
  }

  const voiceKey = VALID_VOICE_KEYS.has(data.voiceKey as ServiceAudioRecord['voiceKey'])
    ? (data.voiceKey as ServiceAudioRecord['voiceKey'])
    : 'rachel';
  const scriptProvider = VALID_SCRIPT_PROVIDERS.has(
    data.scriptProvider as ServiceAudioRecord['scriptProvider']
  )
    ? (data.scriptProvider as ServiceAudioRecord['scriptProvider'])
    : 'curated';

  return {
    serviceId,
    title: typeof data.title === 'string' ? data.title.slice(0, 140) : serviceId,
    audioUrl: audioUrl.slice(0, 512),
    cacheKey,
    voiceKey,
    voiceLabel: typeof data.voiceLabel === 'string' ? data.voiceLabel.slice(0, 40) : 'Rachel',
    scriptText: typeof data.scriptText === 'string' ? data.scriptText.slice(0, 1600) : '',
    scriptProvider,
    audioProvider: 'elevenlabs',
    byteLength: clampInt(data.byteLength, 20_000_000),
  };
}

export async function loadUserServiceAudioMap(
  uid: string
): Promise<Record<string, ServiceAudioRecord>> {
  const path = `users/${uid}/serviceAudio`;
  const result: Record<string, ServiceAudioRecord> = {};
  try {
    const q = query(
      collection(db, 'users', uid, 'serviceAudio'),
      where('uid', '==', uid),
      limit(100)
    );
    const snap = await getDocs(q);
    snap.forEach((docSnap) => {
      const parsed = parseServiceAudioDoc(docSnap.id, docSnap.data() as Record<string, unknown>);
      if (parsed) {
        result[parsed.serviceId] = parsed;
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
  return result;
}

export async function fetchServiceAudioFromFirestore(
  uid: string,
  serviceId: string
): Promise<ServiceAudioRecord | null> {
  const safeServiceId = serviceId.trim().slice(0, 64);
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(safeServiceId)) return null;

  const docPath = `users/${uid}/serviceAudio/${safeServiceId}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'serviceAudio', safeServiceId));
    if (!snap.exists()) return null;
    return parseServiceAudioDoc(snap.id, snap.data() as Record<string, unknown>);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

export function subscribeToServiceAudioDoc(
  uid: string,
  serviceId: string,
  onUpdate: (record: ServiceAudioRecord | null) => void,
  onError?: (error: Error) => void
): () => void {
  const safeServiceId = serviceId.trim().slice(0, 64);
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(safeServiceId)) {
    onUpdate(null);
    return () => {};
  }

  const docPath = `users/${uid}/serviceAudio/${safeServiceId}`;
  const ref = doc(db, 'users', uid, 'serviceAudio', safeServiceId);

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      onUpdate(parseServiceAudioDoc(snap.id, snap.data() as Record<string, unknown>));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, docPath);
      } catch (formattedError) {
        if (onError) {
          onError(
            formattedError instanceof Error
              ? formattedError
              : new Error(String(formattedError))
          );
        } else {
          throw formattedError;
        }
      }
    }
  );
}

export async function saveServiceAudioToFirestore(
  uid: string,
  record: ServiceAudioRecord
): Promise<void> {
  const safeServiceId = record.serviceId.trim().slice(0, 64);
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(safeServiceId)) return;
  if (!/^(\/api\/audio\/stream\/[a-f0-9]{16,64}|https:\/\/.+)$/.test(record.audioUrl)) return;
  if (!/^[a-f0-9]{16,64}$/.test(record.cacheKey)) return;

  const docPath = `users/${uid}/serviceAudio/${safeServiceId}`;
  const mutableFields = {
    title: (record.title.trim() || safeServiceId).slice(0, 140),
    audioUrl: record.audioUrl.slice(0, 512),
    cacheKey: record.cacheKey.slice(0, 64),
    voiceKey: VALID_VOICE_KEYS.has(record.voiceKey) ? record.voiceKey : 'rachel',
    voiceLabel: (record.voiceLabel.trim() || 'Rachel').slice(0, 40),
    scriptText: (record.scriptText.trim() || record.title.trim() || safeServiceId).slice(0, 1600),
    scriptProvider: VALID_SCRIPT_PROVIDERS.has(record.scriptProvider)
      ? record.scriptProvider
      : 'curated',
    audioProvider: 'elevenlabs' as const,
    byteLength: clampInt(record.byteLength, 20_000_000),
  };

  try {
    const userAnchorSnap = await getDoc(doc(db, 'users', uid));
    if (!userAnchorSnap.exists()) {
      return;
    }

    const ref = doc(db, 'users', uid, 'serviceAudio', safeServiceId);
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        uid,
        serviceId: safeServiceId,
        ...mutableFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    await updateDoc(ref, {
      ...mutableFields,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}
