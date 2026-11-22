import { DomainId, NavSection } from '../data/types';
import type { ArcadeMode } from '../components/ArcadeBlitzArena';
import type { QuizMode } from '../components/QuizzesSection';

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

export interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}

export interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: ((this: SpeechRecognitionLike, ev: Event) => void) | null;
  onend: ((this: SpeechRecognitionLike, ev: Event) => void) | null;
  onerror: ((this: SpeechRecognitionLike, ev: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((this: SpeechRecognitionLike, ev: SpeechRecognitionEventLike) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export type VoiceCommandAction =
  | {
      type: 'navigate';
      section: NavSection;
      domain?: DomainId;
      label: string;
    }
  | {
      type: 'start-quiz';
      mode: QuizMode;
      domain: DomainId | 'all';
      label: string;
    }
  | {
      type: 'start-arcade';
      arenaMode: ArcadeMode;
      label: string;
    }
  | {
      type: 'open-coach';
      label: string;
    }
  | {
      type: 'audio-control';
      command: 'play' | 'pause' | 'next' | 'prev' | 'forward' | 'back';
      label: string;
    }
  | {
      type: 'stop-listening';
      label: string;
    };

export const VOICE_COMMAND_EXAMPLES: { phrase: string; description: string }[] = [
  { phrase: 'Start Blitz', description: 'Launch 60-second Blitz Arena' },
  { phrase: 'Start Daily Challenge', description: 'Launch Daily 5 Sprint' },
  { phrase: 'Start Mock Exam', description: 'Launch full timed exam' },
  { phrase: 'Quiz Domain 2', description: 'Start Domain 2 drill' },
  { phrase: 'Go to Flashcards', description: 'Open spaced-repetition deck' },
  { phrase: 'Go to Services', description: 'Open AWS Service Guide' },
  { phrase: 'Next lesson', description: 'Advance lesson audio track' },
  { phrase: 'Pause audio', description: 'Pause active lesson narration' },
  { phrase: 'Open Study Coach', description: 'Open AI Study Coach' },
  { phrase: 'Stop listening', description: 'Turn microphone off' },
];

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

function normalizeSpokenText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDomainId(normalized: string): DomainId | null {
  if (/\bdomain\s*(1|one|first)\b/.test(normalized)) return 'domain-1';
  if (/\bdomain\s*(2|two|to|too|second)\b/.test(normalized)) return 'domain-2';
  if (/\bdomain\s*(3|three|third)\b/.test(normalized)) return 'domain-3';
  if (/\bdomain\s*(4|four|for|fourth)\b/.test(normalized)) return 'domain-4';
  return null;
}

export function parseVoiceCommand(rawTranscript: string): VoiceCommandAction | null {
  const text = normalizeSpokenText(rawTranscript);
  if (!text) return null;

  // 1. Microphone off / stop listening
  if (
    /\b(stop listening|stop voice|turn off voice|turn off mic|mic off|microphone off|mute voice)\b/.test(
      text
    )
  ) {
    return {
      type: 'stop-listening',
      label: 'Voice commands paused',
    };
  }

  // 1b. Hands-free Lesson Audio controls
  if (/\b(pause audio|pause lesson|stop audio|stop lesson|pause track)\b/.test(text)) {
    return {
      type: 'audio-control',
      command: 'pause',
      label: 'Pausing lesson audio',
    };
  }

  if (/\b(play audio|resume audio|play lesson|resume lesson|continue lesson)\b/.test(text)) {
    return {
      type: 'audio-control',
      command: 'play',
      label: 'Playing lesson audio',
    };
  }

  if (/\b(next lesson|next service|skip lesson|next track)\b/.test(text)) {
    return {
      type: 'audio-control',
      command: 'next',
      label: 'Advancing to next lesson',
    };
  }

  if (/\b(previous lesson|previous service|last lesson|previous track)\b/.test(text)) {
    return {
      type: 'audio-control',
      command: 'prev',
      label: 'Returning to previous lesson',
    };
  }

  if (/\b(skip forward|fast forward|forward 15|ahead 15)\b/.test(text)) {
    return {
      type: 'audio-control',
      command: 'forward',
      label: 'Skipped forward 15s',
    };
  }

  if (/\b(skip back|rewind|back 15|go back 15)\b/.test(text)) {
    return {
      type: 'audio-control',
      command: 'back',
      label: 'Rewound 15s',
    };
  }

  // 2. Specific Arcade & Quiz start intents (checked before generic section navigation)
  if (/\b(blitz|60 second|speed blitz)\b/.test(text)) {
    return {
      type: 'start-arcade',
      arenaMode: 'blitz',
      label: 'Starting Blitz Arena',
    };
  }

  if (/\b(daily 5|daily five|daily challenge|start daily|play daily)\b/.test(text)) {
    return {
      type: 'start-arcade',
      arenaMode: 'daily',
      label: 'Starting Daily 5 Challenge',
    };
  }

  if (/\b(survival|survival streak|survival mode)\b/.test(text)) {
    return {
      type: 'start-arcade',
      arenaMode: 'survival',
      label: 'Starting Survival Streak',
    };
  }

  if (/\b(mock exam|mock test|start mock|take mock|full exam)\b/.test(text)) {
    return {
      type: 'start-quiz',
      mode: 'mock',
      domain: 'all',
      label: 'Starting Mock Exam',
    };
  }

  if (/\b(spaced repetition|srs quiz|smart review|due quiz|start review)\b/.test(text)) {
    return {
      type: 'start-quiz',
      mode: 'srs',
      domain: 'all',
      label: 'Starting Smart Review Quiz',
    };
  }

  const domainId = extractDomainId(text);
  if (domainId && /\b(start|quiz|drill|test|practice|begin|launch)\b/.test(text)) {
    const domainNum = domainId.replace('domain-', '');
    return {
      type: 'start-quiz',
      mode: 'drill',
      domain: domainId,
      label: `Starting Domain ${domainNum} Drill`,
    };
  }

  if (
    /\b(start quiz|start a quiz|start practice|practice quiz|quick drill|start drill|take a quiz|begin quiz)\b/.test(
      text
    )
  ) {
    return {
      type: 'start-quiz',
      mode: /\bdrill\b/.test(text) ? 'drill' : 'practice',
      domain: domainId || 'all',
      label: /\bdrill\b/.test(text) ? 'Starting Quick Drill' : 'Starting Practice Quiz',
    };
  }

  // 3. Study Coach intent
  if (/\b(study coach|open coach|ask coach|ai coach)\b/.test(text)) {
    return {
      type: 'open-coach',
      label: 'Opening Study Coach',
    };
  }

  // 4. Primary Section Navigation
  if (/\b(flashcards|flash cards|flashcard|cards deck|go to cards|open cards)\b/.test(text)) {
    return {
      type: 'navigate',
      section: 'flashcards',
      label: 'Going to Flashcards',
    };
  }

  if (/\b(practice labs|practice lab|labs|architecture labs|go to practice|open practice)\b/.test(text)) {
    return {
      type: 'navigate',
      section: 'practice',
      label: 'Going to Practice Labs',
    };
  }

  if (/\b(service guide|services|aws services|go to service)\b/.test(text)) {
    return {
      type: 'navigate',
      section: 'services',
      domain: domainId || undefined,
      label: 'Going to Service Guide',
    };
  }

  if (/\b(quizzes|quiz section|go to quiz|open quiz)\b/.test(text)) {
    return {
      type: 'navigate',
      section: 'quizzes',
      label: 'Going to Quizzes',
    };
  }

  if (/\b(overview|dashboard|home|main screen|start screen)\b/.test(text)) {
    return {
      type: 'navigate',
      section: 'overview',
      label: 'Going to Overview',
    };
  }

  return null;
}

export function matchVoiceCommandFromAlternatives(
  transcripts: string[]
): VoiceCommandAction | null {
  for (const candidate of transcripts) {
    const matched = parseVoiceCommand(candidate);
    if (matched) return matched;
  }
  return null;
}
