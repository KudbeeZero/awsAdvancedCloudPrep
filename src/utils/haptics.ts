const HAPTICS_STORAGE_KEY = 'cloudprep_haptics_enabled_v1';
export const HAPTICS_PREF_EVENT = 'cloudprep-haptics-pref-change';

const MAX_PULSE_MS = 180;
const MAX_PATTERN_STEPS = 8;

export type HapticPattern = number | number[];

function sanitizePattern(pattern: HapticPattern): HapticPattern | null {
  if (typeof pattern === 'number') {
    if (!Number.isFinite(pattern) || pattern <= 0) return null;
    return Math.min(MAX_PULSE_MS, Math.max(1, Math.round(pattern)));
  }
  if (!Array.isArray(pattern) || pattern.length === 0) return null;
  const cleaned = pattern
    .slice(0, MAX_PATTERN_STEPS)
    .map((ms) => (Number.isFinite(ms) && ms > 0 ? Math.min(MAX_PULSE_MS, Math.round(ms)) : 0))
    .filter((ms) => ms > 0);
  return cleaned.length > 0 ? cleaned : null;
}

export function isHapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function isHapticsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(HAPTICS_STORAGE_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export function setHapticsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HAPTICS_STORAGE_KEY, String(enabled));
    window.dispatchEvent(new CustomEvent(HAPTICS_PREF_EVENT, { detail: enabled }));
  } catch {
    // Ignore storage quota issues gracefully
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Low-level safe wrapper around navigator.vibrate.
 * Respects user haptics preference, prefers-reduced-motion, and device capability.
 */
export function triggerHaptic(pattern: HapticPattern = 12): boolean {
  if (!isHapticsEnabled() || prefersReducedMotion() || !isHapticsSupported()) {
    return false;
  }
  const safePattern = sanitizePattern(pattern);
  if (!safePattern) return false;

  try {
    return navigator.vibrate(safePattern);
  } catch {
    return false;
  }
}

/**
 * Crisp single micro-pulse for card flips, option taps, and Hard recall ratings.
 */
export function triggerSelectionHaptic(): boolean {
  return triggerHaptic(8);
}

/**
 * Subtle ascending double-tap pulse for correct quiz answers and Good/Easy flashcard recalls.
 */
export function triggerCorrectHaptic(): boolean {
  return triggerHaptic([10, 24, 14]);
}

/**
 * Distinct gentle muted double-thud for incorrect answers and "Again" flashcard resets.
 */
export function triggerIncorrectHaptic(): boolean {
  return triggerHaptic([24, 36, 20]);
}

/**
 * Escalating tactile pulse pattern as flashcard or arcade streaks climb.
 */
export function triggerComboHaptic(combo: number): boolean {
  if (combo >= 8) {
    return triggerHaptic([12, 22, 16, 22, 22]);
  }
  if (combo >= 5) {
    return triggerHaptic([12, 24, 18, 24, 16]);
  }
  return triggerHaptic([10, 22, 16]);
}

/**
 * Tactile cadence when finishing a quiz, passing a mock exam, or unlocking a milestone.
 */
export function triggerMilestoneHaptic(celebratory = true): boolean {
  return triggerHaptic(celebratory ? [12, 24, 16, 24, 24] : 14);
}
