import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Mic,
  MicOff,
  X,
} from 'lucide-react';
import { playNeutralTap, playSuccessSound } from '../utils/audio';
import { triggerCorrectHaptic, triggerSelectionHaptic } from '../utils/haptics';
import {
  getSpeechRecognitionConstructor,
  isSpeechRecognitionSupported,
  matchVoiceCommandFromAlternatives,
  parseVoiceCommand,
  SpeechRecognitionErrorEventLike,
  SpeechRecognitionEventLike,
  SpeechRecognitionLike,
  VOICE_COMMAND_EXAMPLES,
  VoiceCommandAction,
} from '../utils/voiceCommands';

interface VoiceCommandControlProps {
  onExecuteCommand: (action: Exclude<VoiceCommandAction, { type: 'stop-listening' }>) => void;
}

export function VoiceCommandControl({ onExecuteCommand }: VoiceCommandControlProps) {
  const [supported] = useState<boolean>(isSpeechRecognitionSupported);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [showCommandsHelp, setShowCommandsHelp] = useState<boolean>(false);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [statusFeedback, setStatusFeedback] = useState<{
    kind: 'matched' | 'unmatched' | 'error';
    text: string;
  } | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef<boolean>(false);
  const restartTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const lastProcessedIndexRef = useRef<number>(-1);
  const lastCommandTsRef = useRef<number>(0);

  const onExecuteCommandRef = useRef(onExecuteCommand);
  onExecuteCommandRef.current = onExecuteCommand;

  const scheduleFeedbackClear = useCallback(() => {
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setStatusFeedback(null);
    }, 3500);
  }, []);

  const stopListening = useCallback((showPausedNotice = false) => {
    shouldListenRef.current = false;
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onstart = null;
      rec.onend = null;
      rec.onerror = null;
      rec.onresult = null;
      try {
        rec.stop();
      } catch {
        // Ignore stop error if already stopped
      }
    }
    setIsListening(false);
    setInterimTranscript('');
    if (showPausedNotice) {
      setStatusFeedback({ kind: 'matched', text: 'Voice commands paused' });
      scheduleFeedbackClear();
    }
  }, [scheduleFeedbackClear]);

  const dispatchAction = useCallback(
    (action: VoiceCommandAction) => {
      const now = Date.now();
      if (now - lastCommandTsRef.current < 800) return;
      lastCommandTsRef.current = now;

      if (action.type === 'stop-listening') {
        playNeutralTap();
        triggerSelectionHaptic();
        stopListening(true);
        return;
      }

      playSuccessSound();
      triggerCorrectHaptic();
      setStatusFeedback({ kind: 'matched', text: action.label });
      scheduleFeedbackClear();
      onExecuteCommandRef.current(action);
    },
    [stopListening, scheduleFeedbackClear]
  );

  const startRecognitionSession = useCallback(() => {
    const RecognitionCtor = getSpeechRecognitionConstructor();
    if (!RecognitionCtor) {
      setStatusFeedback({
        kind: 'error',
        text: 'Voice recognition is not supported in this browser. Try Chrome, Safari, or Edge.',
      });
      setShowCommandsHelp(true);
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore abort error
      }
      recognitionRef.current = null;
    }

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 3;
    lastProcessedIndexRef.current = -1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let latestInterim = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result || result.length === 0) continue;

        if (!result.isFinal) {
          const preview = result[0]?.transcript?.trim();
          if (preview) latestInterim = preview;
          continue;
        }

        if (i <= lastProcessedIndexRef.current) continue;
        lastProcessedIndexRef.current = i;

        const alternatives: string[] = [];
        for (let j = 0; j < result.length; j += 1) {
          const text = result[j]?.transcript?.trim();
          if (text) alternatives.push(text);
        }

        if (alternatives.length === 0) continue;

        const matched = matchVoiceCommandFromAlternatives(alternatives);
        setInterimTranscript('');

        if (matched) {
          dispatchAction(matched);
        } else {
          setStatusFeedback({
            kind: 'unmatched',
            text: `Heard "${alternatives[0]}" — try "Start Blitz" or "Go to Flashcards"`,
          });
          scheduleFeedbackClear();
        }
      }

      if (latestInterim) {
        setInterimTranscript(latestInterim);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        shouldListenRef.current = false;
        setIsListening(false);
        setInterimTranscript('');
        setStatusFeedback({
          kind: 'error',
          text: 'Microphone access denied. Allow mic permission in browser settings.',
        });
        setShowCommandsHelp(true);
        return;
      }
      if (event.error === 'audio-capture') {
        shouldListenRef.current = false;
        setIsListening(false);
        setInterimTranscript('');
        setStatusFeedback({
          kind: 'error',
          text: 'No microphone detected on this device.',
        });
        setShowCommandsHelp(true);
        return;
      }
      setStatusFeedback({
        kind: 'error',
        text: 'Voice listener interrupted. Tap Voice to resume.',
      });
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (!shouldListenRef.current) {
        setIsListening(false);
        setInterimTranscript('');
        return;
      }
      // Mobile browsers often end after one utterance even with continuous=true; restart gently
      restartTimerRef.current = window.setTimeout(() => {
        if (shouldListenRef.current) {
          startRecognitionSession();
        }
      }, 250);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      shouldListenRef.current = false;
      setIsListening(false);
      setStatusFeedback({
        kind: 'error',
        text: 'Could not start microphone listener. Please tap Voice again.',
      });
    }
  }, [dispatchAction, scheduleFeedbackClear]);

  const handleToggleMic = () => {
    triggerSelectionHaptic();
    if (!supported) {
      setStatusFeedback({
        kind: 'error',
        text: 'Web Speech recognition requires Chrome, Safari, or Edge. Tap any shortcut below instead.',
      });
      setShowCommandsHelp((prev) => !prev);
      return;
    }

    if (isListening || shouldListenRef.current) {
      playNeutralTap();
      stopListening(true);
      return;
    }

    setStatusFeedback(null);
    shouldListenRef.current = true;
    startRecognitionSession();
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('cloudprep-voice-listening', { detail: { listening: isListening } })
    );
  }, [isListening]);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore cleanup abort errors
        }
      }
    };
  }, []);

  const showFloatingHud = isListening || Boolean(statusFeedback) || showCommandsHelp;

  return (
    <>
      {/* Live Voice Transcript / Command Help Popover anchored cleanly above bottom-left controls */}
      {showFloatingHud && (
        <aside
          aria-label="Voice navigation status and commands"
          className="fixed bottom-[calc(8.5rem+env(safe-area-inset-bottom,0px))] left-3 sm:left-4 md:bottom-20 md:left-6 z-40 w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)] max-w-xs sm:max-w-sm bg-white border border-slate-200 rounded-xl shadow-xl p-3.5 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Mic
                className={`w-3.5 h-3.5 shrink-0 ${
                  isListening ? 'text-[#C2410C] animate-pulse' : 'text-slate-500'
                }`}
                aria-hidden="true"
              />
              <p className="text-xs font-semibold text-slate-900 truncate">
                {isListening ? 'Listening for voice command' : 'Hands-Free Voice Commands'}
              </p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setShowCommandsHelp((prev) => !prev)}
                aria-expanded={showCommandsHelp}
                aria-label={showCommandsHelp ? 'Hide voice commands' : 'Show voice commands'}
                className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
              >
                <HelpCircle className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCommandsHelp(false);
                  setStatusFeedback(null);
                  if (isListening) stopListening(false);
                }}
                aria-label="Close voice panel"
                className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {isListening && (
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200/80 rounded-lg px-2.5 py-2 truncate">
              {interimTranscript
                ? `"${interimTranscript}"`
                : 'Say "Start Blitz", "Go to Flashcards", or "Start Mock Exam"'}
            </p>
          )}

          {statusFeedback && (
            <div
              role="status"
              aria-live="polite"
              className={`flex items-start gap-2 text-xs rounded-lg px-2.5 py-2 ${
                statusFeedback.kind === 'matched'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : statusFeedback.kind === 'error'
                  ? 'bg-rose-50 text-rose-900 border border-rose-200'
                  : 'bg-amber-50 text-amber-900 border border-amber-200'
              }`}
            >
              {statusFeedback.kind === 'matched' ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <span>{statusFeedback.text}</span>
            </div>
          )}

          {showCommandsHelp && (
            <div className="pt-1 border-t border-slate-100 space-y-1.5 max-h-60 overflow-y-auto">
              <p className="text-[11px] font-semibold text-slate-500">
                Supported Voice Phrases (tap to run)
              </p>
              <div className="grid grid-cols-1 gap-1">
                {VOICE_COMMAND_EXAMPLES.map((item) => (
                  <button
                    key={item.phrase}
                    type="button"
                    onClick={() => {
                      const action = parseVoiceCommand(item.phrase);
                      if (action) dispatchAction(action);
                    }}
                    className="w-full min-h-[44px] text-left px-2.5 py-2 rounded-lg hover:bg-slate-100 active:bg-slate-100 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">
                      &ldquo;{item.phrase}&rdquo;
                    </span>
                    <span className="text-[11px] text-slate-500 truncate">{item.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      )}

      {/* Floating Hands-Free Voice Trigger positioned opposite Study Coach */}
      <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] left-3 sm:left-4 md:bottom-6 md:left-6 z-40 flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleToggleMic}
          aria-pressed={isListening}
          aria-label={isListening ? 'Stop voice commands' : 'Start voice commands'}
          className={`inline-flex items-center gap-2 px-3.5 min-h-[46px] rounded-full shadow-lg active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C] ${
            isListening
              ? 'bg-[#C2410C] hover:bg-[#9A3412] text-white shadow-orange-900/25'
              : 'bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 shadow-slate-900/10'
          }`}
        >
          {isListening ? (
            <MicOff className="w-4 h-4 shrink-0" aria-hidden="true" />
          ) : (
            <Mic className="w-4 h-4 text-[#C2410C] shrink-0" aria-hidden="true" />
          )}
          <span className="text-xs sm:text-sm font-semibold">
            {isListening ? 'Listening' : 'Voice'}
          </span>
        </button>

        {!showFloatingHud && (
          <button
            type="button"
            onClick={() => {
              triggerSelectionHaptic();
              setShowCommandsHelp(true);
            }}
            aria-label="Show voice command phrases"
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 shadow-md cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C]"
          >
            <HelpCircle className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </>
  );
}
