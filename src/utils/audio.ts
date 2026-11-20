export { triggerHaptic } from './haptics';

const SOUND_STORAGE_KEY = 'cloudprep_sound_enabled_v1';
export const SOUND_PREF_EVENT = 'cloudprep-sound-pref-change';

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }

  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }

  return sharedAudioCtx;
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(SOUND_STORAGE_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
    window.dispatchEvent(new CustomEvent(SOUND_PREF_EVENT, { detail: enabled }));
  } catch {
    // Ignore storage quota issues
  }
}

function scheduleTone(
  ctx: AudioContext,
  freqStart: number,
  freqEnd: number,
  startOffsetSec: number,
  durationSec: number,
  peakGain: number,
  type: OscillatorType = 'sine'
) {
  const now = ctx.currentTime + startOffsetSec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, now);
  if (freqEnd !== freqStart) {
    osc.frequency.exponentialRampToValueAtTime(freqEnd, now + durationSec);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(peakGain, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

/**
 * Subtle ascending two-note chime for correct quiz answers and Good/Easy flashcard recalls.
 */
export function playSuccessSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  scheduleTone(ctx, 523.25, 523.25, 0, 0.085, 0.055, 'sine'); // C5
  scheduleTone(ctx, 659.25, 659.25, 0.07, 0.15, 0.065, 'sine'); // E5
}

/**
 * Pitch-escalating arcade combo chime that steps upward as streaks climb.
 */
export function playComboSuccessSound(combo: number): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const semitoneBoost = Math.min(combo, 8);
  const ratio = Math.pow(2, semitoneBoost / 12);
  const root = 523.25 * ratio;
  const fifth = 783.99 * ratio;

  scheduleTone(ctx, root, root, 0, 0.07, 0.055, 'triangle');
  scheduleTone(ctx, fifth, fifth, 0.055, 0.14, 0.065, 'sine');
}

/**
 * Celebratory 4-note arpeggio when reaching a new Cloud Rank level.
 */
export function playLevelUpSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  scheduleTone(ctx, 523.25, 523.25, 0, 0.08, 0.055, 'sine'); // C5
  scheduleTone(ctx, 659.25, 659.25, 0.07, 0.08, 0.055, 'sine'); // E5
  scheduleTone(ctx, 783.99, 783.99, 0.14, 0.09, 0.06, 'sine'); // G5
  scheduleTone(ctx, 1046.5, 1046.5, 0.21, 0.24, 0.07, 'sine'); // C6
}

/**
 * Crisp two-tone arcade round-start fanfare.
 */
export function playArcadeStartSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  scheduleTone(ctx, 440, 440, 0, 0.07, 0.05, 'triangle');
  scheduleTone(ctx, 659.25, 659.25, 0.07, 0.14, 0.06, 'triangle');
}

/**
 * Quick subtle clock tick for the final seconds of a Blitz round.
 */
export function playTickSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  scheduleTone(ctx, 880, 740, 0, 0.035, 0.025, 'sine');
}

/**
 * Gentle muted descending tone for incorrect answers and "Again" flashcard resets.
 */
export function playFailureSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  scheduleTone(ctx, 277.18, 246.94, 0, 0.11, 0.055, 'triangle'); // C#4 -> B3
  scheduleTone(ctx, 220.0, 196.0, 0.09, 0.16, 0.05, 'triangle'); // A3 -> G3
}

/**
 * Soft neutral tactile tap for "Hard" flashcard grading or card flips.
 */
export function playNeutralTap(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  scheduleTone(ctx, 420, 480, 0, 0.055, 0.035, 'sine');
}

/**
 * Subtle 3-note completion cadence when finishing a quiz or arcade run.
 */
export function playQuizCompleteSound(passed: boolean): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  if (passed) {
    scheduleTone(ctx, 523.25, 523.25, 0, 0.1, 0.055, 'sine'); // C5
    scheduleTone(ctx, 659.25, 659.25, 0.08, 0.1, 0.06, 'sine'); // E5
    scheduleTone(ctx, 783.99, 783.99, 0.16, 0.22, 0.065, 'sine'); // G5
  } else {
    scheduleTone(ctx, 392.0, 392.0, 0, 0.11, 0.05, 'sine'); // G4
    scheduleTone(ctx, 349.23, 349.23, 0.1, 0.18, 0.045, 'sine'); // F4
  }
}
