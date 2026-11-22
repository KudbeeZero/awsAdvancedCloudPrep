import { FormEvent, Fragment, TouchEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Compass,
  Copy,
  Lightbulb,
  Loader2,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import { DomainId, NavSection } from '../data/types';
import { ProgressSnapshot } from '../utils/coachProgress';
import {
  BriefingData,
  ChatMessage,
  CoachSessionState,
  HintData,
  StudyPlanStep,
} from '../utils/coachSession';
import { triggerSelectionHaptic } from '../utils/haptics';
import { ProAudioPlayer } from './ProAudioPlayer';

export type CoachTab = 'briefing' | 'hint' | 'chat';

interface StudyCoachSheetProps {
  isOpen: boolean;
  initialTab: CoachTab;
  hintTriggerCount: number;
  unreadUpdatesCount: number;
  snapshot: ProgressSnapshot;
  sessionState: CoachSessionState;
  cloudSyncStatus?: 'local' | 'connecting' | 'syncing' | 'synced' | 'error';
  lastSyncedAt?: string | null;
  isCloudSignedIn?: boolean;
  pendingChatPrompt?: string | null;
  onConsumePendingChatPrompt?: () => void;
  onSyncNow?: () => void;
  onUpdateSession: (updater: (prev: CoachSessionState) => CoachSessionState) => void;
  onNewSession: () => void;
  onOpen: (tab?: CoachTab) => void;
  onClose: () => void;
  onNavigateAction: (section: NavSection, domain?: DomainId) => void;
}

class CoachCancelledError extends Error {
  constructor() {
    super('Request cancelled');
    this.name = 'CoachCancelledError';
  }
}

function renderInlineBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={idx}>{part}</Fragment>;
  });
}

function renderFormattedCoachText(text: string) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) return <div key={idx} className="h-1" />;

        if (line.startsWith('- ') || line.startsWith('• ') || line.startsWith('* ')) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span aria-hidden="true" className="text-[#C2410C] font-bold mt-0.5">
                ·
              </span>
              <span className="flex-1">{renderInlineBold(line.slice(2).trim())}</span>
            </div>
          );
        }

        return <p key={idx}>{renderInlineBold(line)}</p>;
      })}
    </div>
  );
}

export function StudyCoachSheet({
  isOpen,
  initialTab,
  hintTriggerCount,
  unreadUpdatesCount,
  snapshot,
  sessionState,
  cloudSyncStatus = 'local',
  lastSyncedAt = null,
  isCloudSignedIn = false,
  pendingChatPrompt = null,
  onConsumePendingChatPrompt,
  onSyncNow,
  onUpdateSession,
  onNewSession,
  onOpen,
  onClose,
  onNavigateAction,
}: StudyCoachSheetProps) {
  const [tab, setTab] = useState<CoachTab>(initialTab);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);

  const [hintLoading, setHintLoading] = useState(false);
  const [hintError, setHintError] = useState<string | null>(null);
  const [showStep2Clue, setShowStep2Clue] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [failedChatPrompt, setFailedChatPrompt] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  // Mobile swipe-down-to-dismiss state (GPU translateY only)
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const touchStartYRef = useRef<number | null>(null);

  const scrollBodyRef = useRef<HTMLDivElement | null>(null);
  const lastHintTriggerRef = useRef<number>(0);
  const briefingAbortRef = useRef<AbortController | null>(null);
  const hintAbortRef = useRef<AbortController | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);

  const { sessionId, briefing, hintData, hintContextKey, chatMessages, completedPlanSteps } =
    sessionState;

  const speechSupported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined';

  const stopSpeaking = useCallback(() => {
    if (speechSupported) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore browser speech synthesis cancel quirks
      }
    }
    setSpeakingId(null);
  }, [speechSupported]);

  const toggleSpeak = useCallback(
    (id: string, rawText: string) => {
      if (!speechSupported) return;
      triggerSelectionHaptic();
      if (speakingId === id) {
        stopSpeaking();
        return;
      }
      stopSpeaking();
      try {
        const clean = rawText.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.rate = 1.02;
        utterance.onend = () => setSpeakingId(null);
        utterance.onerror = () => setSpeakingId(null);
        setSpeakingId(id);
        window.speechSynthesis.speak(utterance);
      } catch {
        setSpeakingId(null);
      }
    },
    [speechSupported, speakingId, stopSpeaking]
  );

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setDragOffsetY(0);
    } else {
      stopSpeaking();
    }
  }, [isOpen, initialTab, stopSpeaking]);

  useEffect(() => {
    return () => {
      briefingAbortRef.current?.abort();
      hintAbortRef.current?.abort();
      chatAbortRef.current?.abort();
      stopSpeaking();
    };
  }, [stopSpeaking]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && tab === 'chat' && scrollBodyRef.current) {
      scrollBodyRef.current.scrollTop = scrollBodyRef.current.scrollHeight;
    }
  }, [isOpen, tab, chatMessages.length, chatLoading, streamingText]);

  const postCoachRequest = useCallback(
    async (
      payload: Record<string, unknown>,
      abortRef: { current: AbortController | null }
    ): Promise<Record<string, unknown>> => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error(
          'You are currently offline. Reconnect to the internet to ask Study Coach.'
        );
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      let timedOut = false;
      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 30_000);

      try {
        const res = await fetch('/api/agent/coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const rawText = await res.text();
        let data: Record<string, unknown> = {};
        if (rawText) {
          try {
            const parsed = JSON.parse(rawText);
            if (parsed && typeof parsed === 'object') {
              data = parsed as Record<string, unknown>;
            }
          } catch {
            // Non-JSON upstream error response
          }
        }
        if (!res.ok) {
          const msg =
            typeof data.error === 'string' && data.error.trim()
              ? data.error
              : `Coach request failed (${res.status}). Please try again.`;
          throw new Error(msg);
        }
        return data;
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          if (timedOut) {
            throw new Error('Study Coach timed out waiting for a response. Please try again.');
          }
          throw new CoachCancelledError();
        }
        throw err;
      } finally {
        window.clearTimeout(timeoutId);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    []
  );

  const fetchBriefing = useCallback(async () => {
    setBriefingLoading(true);
    setBriefingError(null);
    const activeSessionId = sessionId;
    try {
      const data = await postCoachRequest(
        {
          sessionId: activeSessionId,
          intent: 'briefing',
          progress: snapshot,
        },
        briefingAbortRef
      );
      const nextBriefing = data.briefing as BriefingData | undefined;
      if (!nextBriefing || typeof nextBriefing.headline !== 'string') {
        throw new Error('Received an incomplete coach briefing. Please retry.');
      }
      onUpdateSession((prev) =>
        prev.sessionId === activeSessionId
          ? { ...prev, briefing: nextBriefing, updatedAtIso: new Date().toISOString() }
          : prev
      );
    } catch (err: unknown) {
      if (err instanceof CoachCancelledError) return;
      setBriefingError(
        err instanceof Error ? err.message : 'Unable to reach study coach.'
      );
    } finally {
      setBriefingLoading(false);
    }
  }, [sessionId, snapshot, postCoachRequest, onUpdateSession]);

  const fetchHint = useCallback(async () => {
    const key = `${snapshot.activeContext?.type || 'none'}:${snapshot.activeContext?.title || ''}`;
    const activeSessionId = sessionId;
    setHintLoading(true);
    setHintError(null);
    setShowStep2Clue(false);
    try {
      const data = await postCoachRequest(
        {
          sessionId: activeSessionId,
          intent: 'hint',
          progress: snapshot,
        },
        hintAbortRef
      );
      const nextHint = data.hintData as HintData | undefined;
      if (!nextHint || typeof nextHint.hint !== 'string') {
        throw new Error('Received an incomplete hint. Please retry.');
      }
      onUpdateSession((prev) =>
        prev.sessionId === activeSessionId
          ? {
              ...prev,
              hintData: nextHint,
              hintContextKey: key,
              updatedAtIso: new Date().toISOString(),
            }
          : prev
      );
    } catch (err: unknown) {
      if (err instanceof CoachCancelledError) return;
      setHintError(err instanceof Error ? err.message : 'Unable to fetch hint.');
    } finally {
      setHintLoading(false);
    }
  }, [sessionId, snapshot, postCoachRequest, onUpdateSession]);

  // Auto-fetch briefing on first open to briefing tab in this session
  useEffect(() => {
    if (isOpen && tab === 'briefing' && !briefing && !briefingLoading && !briefingError) {
      void fetchBriefing();
    }
  }, [isOpen, tab, sessionId, briefing, briefingLoading, briefingError, fetchBriefing]);

  // Auto-fetch hint when triggered from a contextual Hint button or when active context changed
  useEffect(() => {
    const currentKey = `${snapshot.activeContext?.type || 'none'}:${snapshot.activeContext?.title || ''}`;
    const triggerIncremented = hintTriggerCount > lastHintTriggerRef.current;
    if (
      isOpen &&
      tab === 'hint' &&
      !hintLoading &&
      (triggerIncremented || (currentKey !== hintContextKey && !hintError))
    ) {
      lastHintTriggerRef.current = hintTriggerCount;
      void fetchHint();
    }
  }, [
    isOpen,
    tab,
    hintTriggerCount,
    hintContextKey,
    hintLoading,
    hintError,
    snapshot.activeContext?.type,
    snapshot.activeContext?.title,
    fetchHint,
  ]);

  const sendChatMessage = useCallback(
    async (textOverride?: string, isRetry = false) => {
      const messageText = (textOverride ?? chatInput).trim().slice(0, 500);
      if (!messageText || chatLoading) return;

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setChatError('You are currently offline. Reconnect to the internet to ask Study Coach.');
        setFailedChatPrompt(messageText);
        return;
      }

      triggerSelectionHaptic();
      const activeSessionId = sessionId;
      const priorHistory = (isRetry ? chatMessages.slice(0, -1) : chatMessages)
        .slice(-8)
        .map((m) => ({
          role: m.role,
          text: m.text,
        }));

      if (!isRetry) {
        const userMsg: ChatMessage = {
          id: `${Date.now()}-u`,
          role: 'user',
          text: messageText,
        };
        onUpdateSession((prev) =>
          prev.sessionId === activeSessionId
            ? {
                ...prev,
                chatMessages: [...prev.chatMessages, userMsg],
                updatedAtIso: new Date().toISOString(),
              }
            : prev
        );
        if (!textOverride) setChatInput('');
      }

      setChatLoading(true);
      setStreamingText('');
      setChatError(null);
      setFailedChatPrompt(null);

      chatAbortRef.current?.abort();
      const controller = new AbortController();
      chatAbortRef.current = controller;
      let timedOut = false;
      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 30_000);

      let accumulated = '';
      let followUps: string[] | undefined;

      try {
        const res = await fetch('/api/agent/coach/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: activeSessionId,
            progress: snapshot,
            userMessage: messageText,
            history: priorHistory,
          }),
          signal: controller.signal,
        });

        const contentType = res.headers.get('content-type') || '';
        if (!res.ok) {
          const rawErr = await res.text();
          let msg = `Coach request failed (${res.status}). Please try again.`;
          try {
            const parsed = JSON.parse(rawErr) as { error?: string };
            if (parsed.error) msg = parsed.error;
          } catch {
            // Keep generic status fallback
          }
          throw new Error(msg);
        }

        if (!res.body || !contentType.includes('text/event-stream')) {
          throw new Error('Streaming unavailable.');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const evt of events) {
            const dataLines = evt
              .split('\n')
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.slice(5).trim());

            for (const jsonLine of dataLines) {
              if (!jsonLine) continue;
              let parsedEvt: {
                type?: string;
                text?: string;
                error?: string;
                followUps?: unknown;
              };
              try {
                parsedEvt = JSON.parse(jsonLine);
              } catch {
                continue;
              }
              if (parsedEvt.type === 'delta' && typeof parsedEvt.text === 'string') {
                accumulated += parsedEvt.text;
                setStreamingText(accumulated);
              } else if (parsedEvt.type === 'done') {
                if (Array.isArray(parsedEvt.followUps)) {
                  followUps = parsedEvt.followUps
                    .filter((item): item is string => typeof item === 'string')
                    .slice(0, 3);
                }
              } else if (parsedEvt.type === 'error' && parsedEvt.error) {
                throw new Error(parsedEvt.error);
              }
            }
          }
        }

        const finalText =
          accumulated.trim() ||
          'I can help you review AWS Cloud Practitioner (CLF-C02) topics and your study progress.';

        const replyMsg: ChatMessage = {
          id: `${Date.now()}-m`,
          role: 'model',
          text: finalText,
          followUps,
        };
        onUpdateSession((prev) =>
          prev.sessionId === activeSessionId
            ? {
                ...prev,
                chatMessages: [...prev.chatMessages, replyMsg],
                updatedAtIso: new Date().toISOString(),
              }
            : prev
        );
        setStreamingText('');
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          if (timedOut) {
            setChatError('Study Coach timed out waiting for a response. Please try again.');
            setFailedChatPrompt(messageText);
          }
          return;
        }
        setStreamingText('');
        setChatError(err instanceof Error ? err.message : 'Unable to contact coach.');
        setFailedChatPrompt(messageText);
      } finally {
        window.clearTimeout(timeoutId);
        if (chatAbortRef.current === controller) {
          chatAbortRef.current = null;
        }
        setChatLoading(false);
      }
    },
    [chatInput, chatLoading, sessionId, chatMessages, snapshot, onUpdateSession]
  );

  useEffect(() => {
    if (isOpen && tab === 'chat' && pendingChatPrompt && !chatLoading) {
      const prompt = pendingChatPrompt;
      onConsumePendingChatPrompt?.();
      void sendChatMessage(prompt);
    }
  }, [isOpen, tab, pendingChatPrompt, chatLoading, onConsumePendingChatPrompt, sendChatMessage]);

  const handleChatSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendChatMessage();
  };

  const handleTogglePlanStep = (stepKey: string) => {
    triggerSelectionHaptic();
    const cleanKey = stepKey.trim().slice(0, 120);
    if (!cleanKey) return;
    onUpdateSession((prev) => {
      const exists = prev.completedPlanSteps.includes(cleanKey);
      return {
        ...prev,
        completedPlanSteps: exists
          ? prev.completedPlanSteps.filter((s) => s !== cleanKey)
          : [...prev.completedPlanSteps, cleanKey].slice(0, 12),
        updatedAtIso: new Date().toISOString(),
      };
    });
  };

  const navigateFromPlan = (section: NavSection, domain?: DomainId | 'all') => {
    triggerSelectionHaptic();
    const validSections: NavSection[] = [
      'overview',
      'services',
      'practice',
      'quizzes',
      'flashcards',
    ];
    const targetSec = validSections.includes(section) ? section : 'quizzes';
    const domainArg = domain && domain !== 'all' ? domain : undefined;
    onClose();
    onNavigateAction(targetSec, domainArg);
  };

  const handleActionClick = () => {
    if (!briefing) return;
    navigateFromPlan(briefing.recommendedSection, briefing.recommendedDomain);
  };

  const handleResetCoachSession = () => {
    triggerSelectionHaptic();
    stopSpeaking();
    briefingAbortRef.current?.abort();
    hintAbortRef.current?.abort();
    chatAbortRef.current?.abort();
    setBriefingLoading(false);
    setHintLoading(false);
    setChatLoading(false);
    setStreamingText('');
    setBriefingError(null);
    setHintError(null);
    setChatError(null);
    setFailedChatPrompt(null);
    setShowStep2Clue(false);
    setChatInput('');
    onNewSession();
  };

  const handleCopyMessage = async (msgId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text.replace(/\*\*/g, ''));
      triggerSelectionHaptic();
      setCopiedMsgId(msgId);
      window.setTimeout(() => {
        setCopiedMsgId((curr) => (curr === msgId ? null : curr));
      }, 1500);
    } catch {
      // Ignore clipboard permissions gracefully
    }
  };

  // Context-aware starter prompts tailored to what the learner is studying right now
  const quickStartPrompts = useMemo(() => {
    const prompts: string[] = [];
    const ctx = snapshot.activeContext;
    if (ctx && ctx.type !== 'overview' && ctx.title) {
      const shortTitle = ctx.title.slice(0, 48);
      if (ctx.isAnswerVisible === false) {
        prompts.push(`Explain the AWS concepts tested in "${shortTitle}" without giving away the answer`);
      } else {
        prompts.push(`Give me a 1-line memory hook for "${shortTitle}"`);
      }
    }
    if (snapshot.weakestDomain) {
      prompts.push(`Coach me on my weakest area: ${snapshot.weakestDomain.title}`);
    }
    if (snapshot.lapsedItems.length > 0) {
      prompts.push(`Clarify this topic I missed: ${snapshot.lapsedItems[0].topic.slice(0, 44)}`);
    }
    if (prompts.length < 3) {
      prompts.push('What should I study next based on my readiness forecast?');
    }
    if (prompts.length < 3) {
      prompts.push('Security Groups vs Network ACLs in 3 crisp bullets');
    }
    if (prompts.length < 3) {
      prompts.push('Compare AWS Support Plans for exam scenarios');
    }
    return prompts.slice(0, 3);
  }, [snapshot.activeContext, snapshot.weakestDomain, snapshot.lapsedItems]);

  // Mobile sheet swipe-down handlers
  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      touchStartYRef.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (touchStartYRef.current === null || e.touches.length !== 1) return;
    const deltaY = e.touches[0].clientY - touchStartYRef.current;
    if (deltaY > 0) {
      setDragOffsetY(Math.min(deltaY, 220));
    }
  };

  const handleTouchEnd = () => {
    if (touchStartYRef.current === null) return;
    touchStartYRef.current = null;
    if (dragOffsetY > 88) {
      triggerSelectionHaptic();
      setDragOffsetY(0);
      onClose();
    } else {
      setDragOffsetY(0);
    }
  };

  const handleSwitchTab = (nextTab: CoachTab) => {
    if (nextTab !== tab) {
      triggerSelectionHaptic();
      stopSpeaking();
    }
    setTab(nextTab);
  };

  return (
    <>
      {/* Floating Coach Trigger positioned safely above mobile bottom tab bar */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => {
            triggerSelectionHaptic();
            onOpen('briefing');
          }}
          aria-label="Open Study Coach Agent"
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] right-3 sm:right-4 md:bottom-6 md:right-6 z-40 inline-flex items-center gap-2 px-4 min-h-[46px] rounded-full bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-900/20 active:scale-[0.98] transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C]"
        >
          <Compass className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          <span className="text-xs sm:text-sm font-semibold whitespace-nowrap tabular-nums">
            Study Coach{unreadUpdatesCount > 0 ? ` · ${unreadUpdatesCount}` : ''}
          </span>
        </button>
      )}

      {/* Backdrop + Responsive Sheet (Bottom Sheet on iPhone, Right Drawer on Desktop) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end md:items-stretch justify-end bg-slate-900/45 backdrop-blur-[2px]"
          onClick={onClose}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Study Coach Agent"
            onClick={(e) => e.stopPropagation()}
            style={
              dragOffsetY > 0
                ? { transform: `translateY(${dragOffsetY}px)`, transition: 'none' }
                : undefined
            }
            className="w-full md:w-[456px] max-h-[88dvh] md:max-h-screen md:h-full bg-white rounded-t-3xl md:rounded-none border-t md:border-t-0 md:border-l border-slate-200 flex flex-col overflow-hidden shadow-2xl pb-safe transition-transform duration-200"
          >
            {/* Mobile Drag Handle + Swipe-Down Header */}
            <div
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="shrink-0"
            >
              <div className="md:hidden pt-3 pb-1 flex justify-center">
                <div className="w-10 h-1.5 bg-slate-300 rounded-full" />
              </div>

              {/* Header */}
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-display text-base font-bold text-slate-900 truncate">
                    CloudPrep Study Coach
                  </h2>
                  <p className="text-xs text-slate-500 font-mono tabular-nums truncate">
                    Forecast {snapshot.examForecast.scaledForecast}/1000 · {snapshot.dueFlashcards} cards due
                    {isCloudSignedIn
                      ? cloudSyncStatus === 'syncing' || cloudSyncStatus === 'connecting'
                        ? ' · Syncing...'
                        : cloudSyncStatus === 'error'
                        ? ' · Sync paused'
                        : ' · Cloud Synced'
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={handleResetCoachSession}
                    disabled={briefingLoading || hintLoading || chatLoading}
                    title="Start fresh isolated coach session"
                    aria-label="Start new coach session"
                    className="inline-flex items-center justify-center gap-1 min-w-[44px] px-2.5 min-h-[44px] rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer disabled:opacity-40"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">New Session</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close Study Coach"
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                  >
                    <X className="w-5 h-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            {/* 3-Tab Switcher */}
            <div className="px-4 sm:px-5 py-2.5 bg-slate-50 border-b border-slate-200 shrink-0">
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 rounded-lg">
                <button
                  type="button"
                  onClick={() => handleSwitchTab('briefing')}
                  className={`min-h-[44px] text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    tab === 'briefing'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Study Plan
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchTab('hint')}
                  className={`min-h-[44px] text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    tab === 'hint'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Context Hint
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchTab('chat')}
                  className={`min-h-[44px] text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    tab === 'chat'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Ask Coach
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div ref={scrollBodyRef} className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* TAB 1: PROGRESS BRIEFING & MICRO STUDY PLAN */}
              {tab === 'briefing' && (
                <div className="space-y-5">
                  {/* Live Progress Summary Strip */}
                  <div className="grid grid-cols-3 gap-2.5 text-center bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div>
                      <p className="text-[11px] text-slate-500">Forecast</p>
                      <p
                        className={`font-mono text-sm font-bold tabular-nums ${
                          snapshot.examForecast.scaledForecast >= 700
                            ? 'text-emerald-700'
                            : 'text-[#C2410C]'
                        }`}
                      >
                        {snapshot.examForecast.scaledForecast}/1000
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Services</p>
                      <p className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                        {snapshot.reviewedServicesCount}/{snapshot.totalServicesCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Labs</p>
                      <p className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                        {snapshot.completedLabsCount}/{snapshot.totalLabsCount}
                      </p>
                    </div>
                  </div>

                  {/* Weakest Domain Priority Strip */}
                  {snapshot.weakestDomain && (
                    <div className="px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-600 truncate">
                        Priority Domain:{' '}
                        <strong className="text-slate-900">
                          {snapshot.weakestDomain.title}
                        </strong>
                      </span>
                      <span className="font-mono tabular-nums text-[#C2410C] font-semibold shrink-0">
                        {snapshot.weakestDomain.accuracyPct !== null
                          ? `${snapshot.weakestDomain.accuracyPct}% acc`
                          : `${snapshot.weakestDomain.dueItems} due`}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Coach Assessment
                    </span>
                    <div className="flex items-center gap-1">
                      {speechSupported && briefing && !briefingLoading && (
                        <button
                          type="button"
                          onClick={() =>
                            toggleSpeak(
                              'briefing',
                              `${briefing.headline}. ${briefing.readinessVerdict || ''} ${briefing.progressUpdate}`
                            )
                          }
                          aria-label={speakingId === 'briefing' ? 'Stop audio briefing' : 'Listen to briefing'}
                          className="inline-flex items-center gap-1 min-h-[44px] px-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                        >
                          {speakingId === 'briefing' ? (
                            <>
                              <Square className="w-3 h-3 text-[#C2410C]" aria-hidden="true" />
                              Stop
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                              Listen
                            </>
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={briefingLoading}
                        onClick={() => {
                          triggerSelectionHaptic();
                          void fetchBriefing();
                        }}
                        className="inline-flex items-center gap-1.5 min-h-[44px] px-2.5 text-xs font-semibold text-[#C2410C] hover:bg-amber-50 rounded-md cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${briefingLoading ? 'animate-spin' : ''}`}
                          aria-hidden="true"
                        />
                        Refresh
                      </button>
                    </div>
                  </div>

                  {briefingLoading && (
                    <div className="py-10 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
                      <Loader2 className="w-5 h-5 animate-spin text-[#C2410C]" aria-hidden="true" />
                      Building your personalized study prescription...
                    </div>
                  )}

                  {briefingError && (
                    <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-2.5">
                      <p className="font-semibold">Coach Update Unavailable</p>
                      <p>{briefingError}</p>
                      <button
                        type="button"
                        onClick={() => void fetchBriefing()}
                        className="inline-flex items-center gap-1.5 px-3 min-h-[44px] font-semibold bg-white border border-rose-300 text-rose-800 hover:bg-rose-100 rounded-lg cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                        Retry Update
                      </button>
                    </div>
                  )}

                  {!briefingLoading && briefing && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                        <h3 className="font-display text-base font-bold text-slate-900">
                          {briefing.headline}
                        </h3>
                        {briefing.readinessVerdict && (
                          <p className="text-xs font-semibold text-[#9A3412]">
                            {briefing.readinessVerdict}
                          </p>
                        )}
                        <p className="text-sm text-slate-700 leading-relaxed">
                          {briefing.progressUpdate}
                        </p>
                      </div>

                      <ProAudioPlayer
                        compact
                        lessonType="coach"
                        lessonId={`briefing-${sessionId.slice(0, 24)}`}
                        title={briefing.headline}
                        summary={`${briefing.readinessVerdict ? `${briefing.readinessVerdict} ` : ''}${briefing.progressUpdate}`}
                        facts={briefing.pertinentFacts}
                        examTip={`Next recommended focus: ${briefing.recommendedActionLabel}`}
                      />

                      {briefing.studyPlan && briefing.studyPlan.length > 0 && (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-display text-xs font-bold text-slate-700">
                              Recommended Session Queue
                            </h4>
                            <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                              {
                                briefing.studyPlan.filter((st) =>
                                  completedPlanSteps.includes(st.stepTitle.slice(0, 120))
                                ).length
                              }
                              /{briefing.studyPlan.length} done
                            </span>
                          </div>
                          <div className="space-y-2">
                            {briefing.studyPlan.map((step: StudyPlanStep, idx: number) => {
                              const stepKey = step.stepTitle.slice(0, 120);
                              const isDone = completedPlanSteps.includes(stepKey);
                              return (
                                <div
                                  key={`${idx}-${step.stepTitle}`}
                                  className={`bg-white border rounded-xl transition-colors flex items-stretch overflow-hidden ${
                                    isDone
                                      ? 'border-emerald-200 bg-emerald-50/40'
                                      : 'border-slate-200 hover:border-[#C2410C]'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePlanStep(stepKey)}
                                    aria-label={
                                      isDone
                                        ? `Mark "${step.stepTitle}" incomplete`
                                        : `Mark "${step.stepTitle}" complete`
                                    }
                                    aria-pressed={isDone}
                                    className="min-w-[44px] px-2 flex items-center justify-center border-r border-slate-100 hover:bg-slate-50 cursor-pointer shrink-0"
                                  >
                                    <span
                                      className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                                        isDone
                                          ? 'bg-emerald-600 border-emerald-600 text-white'
                                          : 'border-slate-300 bg-white text-transparent'
                                      }`}
                                    >
                                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => navigateFromPlan(step.section, step.domain)}
                                    className="flex-1 min-w-0 text-left p-3 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                                  >
                                    <div className="min-w-0 space-y-0.5">
                                      <div className="flex items-center gap-2 text-xs">
                                        <span className="font-mono font-bold text-[#C2410C] tabular-nums">
                                          0{idx + 1}.
                                        </span>
                                        <span
                                          className={`font-semibold truncate ${
                                            isDone
                                              ? 'line-through text-slate-500'
                                              : 'text-slate-900'
                                          }`}
                                        >
                                          {step.stepTitle}
                                        </span>
                                        <span className="text-slate-400" aria-hidden="true">
                                          ·
                                        </span>
                                        <span className="font-mono text-[11px] text-slate-500 whitespace-nowrap shrink-0">
                                          {step.durationLabel}
                                        </span>
                                      </div>
                                      <p className="text-xs text-slate-600 leading-snug">
                                        {step.reason}
                                      </p>
                                    </div>
                                    <ArrowRight
                                      className="w-4 h-4 text-slate-400 group-hover:text-[#C2410C] shrink-0 transition-colors"
                                      aria-hidden="true"
                                    />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="space-y-2.5">
                        <h4 className="font-display text-xs font-bold text-slate-700">
                          High-Yield CLF-C02 Reminders
                        </h4>
                        <ul className="space-y-2 text-sm text-slate-700">
                          {briefing.pertinentFacts.map((fact, idx) => (
                            <li
                              key={`${idx}-${fact.slice(0, 24)}`}
                              className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs leading-relaxed"
                            >
                              {fact}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <button
                        type="button"
                        onClick={handleActionClick}
                        className="w-full min-h-[46px] px-4 inline-flex items-center justify-center gap-2 text-sm font-semibold bg-[#C2410C] hover:bg-[#9A3412] text-white rounded-xl transition-colors cursor-pointer"
                      >
                        {briefing.recommendedActionLabel}
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: PROGRESSIVE 2-STEP CONTEXTUAL HINT */}
              {tab === 'hint' && (
                <div className="space-y-5">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-500">
                      <span>Current Focus · {snapshot.activeContext?.type || 'overview'}</span>
                      {snapshot.activeContext?.isAnswerVisible === false && (
                        <span className="text-[#C2410C] font-semibold">Spoiler-Safe</span>
                      )}
                    </div>
                    <p className="font-display text-sm font-bold text-slate-900">
                      {snapshot.activeContext?.title || 'CLF-C02 Overview'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      Progressive Socratic Hint
                    </span>
                    <button
                      type="button"
                      disabled={hintLoading}
                      onClick={() => {
                        triggerSelectionHaptic();
                        void fetchHint();
                      }}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-2.5 text-xs font-semibold text-[#C2410C] hover:bg-amber-50 rounded-md cursor-pointer disabled:opacity-50"
                    >
                      <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
                      Refresh Hint
                    </button>
                  </div>

                  {hintLoading && (
                    <div className="py-10 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
                      <Loader2 className="w-5 h-5 animate-spin text-[#C2410C]" aria-hidden="true" />
                      Crafting a two-step spoiler-safe hint...
                    </div>
                  )}

                  {hintError && (
                    <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-2.5">
                      <p>{hintError}</p>
                      <button
                        type="button"
                        onClick={() => void fetchHint()}
                        className="inline-flex items-center gap-1.5 px-3 min-h-[44px] font-semibold bg-white border border-rose-300 text-rose-800 hover:bg-rose-100 rounded-lg cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                        Retry Hint
                      </button>
                    </div>
                  )}

                  {!hintLoading && hintData && (
                    <div className="space-y-3.5">
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5">
                        <p className="text-xs font-bold text-[#C2410C]">Step 1 · Guiding Nudge</p>
                        <p className="text-sm text-slate-800 leading-relaxed">{hintData.hint}</p>
                      </div>

                      {hintData.deeperClue && (
                        showStep2Clue ? (
                          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2.5">
                            <div className="space-y-1">
                              <p className="text-xs font-bold text-slate-900">
                                Step 2 · Elimination Rule
                              </p>
                              <p className="text-sm text-slate-700 leading-relaxed">
                                {hintData.deeperClue}
                              </p>
                            </div>
                            {hintData.distractorWatchout && (
                              <div className="pt-2 border-t border-slate-100 space-y-1">
                                <p className="text-[11px] font-mono font-semibold text-rose-700">
                                  Exam Trap Watchout
                                </p>
                                <p className="text-xs text-slate-600 leading-relaxed">
                                  {hintData.distractorWatchout}
                                </p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              triggerSelectionHaptic();
                              setShowStep2Clue(true);
                            }}
                            className="w-full min-h-[44px] px-4 text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                          >
                            Still unsure? Reveal Step 2 Elimination Clue
                          </button>
                        )
                      )}

                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                        <p className="text-xs font-bold text-slate-700">Pertinent Exam Rule</p>
                        <p className="text-xs text-slate-700 leading-relaxed">
                          {hintData.examRule}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={chatLoading}
                        onClick={() => {
                          const topic = snapshot.activeContext?.title || 'this CLF-C02 concept';
                          handleSwitchTab('chat');
                          void sendChatMessage(
                            snapshot.activeContext?.isAnswerVisible === false
                              ? `Break down the AWS service trade-offs behind "${topic.slice(0, 60)}" without spoiling the answer.`
                              : `Walk me through "${topic.slice(0, 60)}" with a quick example.`
                          );
                        }}
                        className="w-full min-h-[44px] px-4 inline-flex items-center justify-center gap-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                        Discuss This in Ask Coach
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: ASK COACH STREAMING CHAT */}
              {tab === 'chat' && (
                <div className="space-y-4">
                  {chatMessages.length === 0 && !chatLoading && (
                    <div className="space-y-3">
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 leading-relaxed flex items-start gap-2.5">
                        <MessageSquare
                          className="w-4 h-4 text-[#C2410C] shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <span>
                          Real-time CLF-C02 tutor tuned to your progress. Ask for service
                          comparisons, memory hooks, or quick practice scenarios.
                        </span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {quickStartPrompts.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => void sendChatMessage(preset)}
                            className="text-left px-3.5 py-2.5 min-h-[44px] text-xs font-medium bg-white border border-slate-200 hover:border-[#C2410C] rounded-xl text-slate-800 cursor-pointer flex items-center justify-between gap-2 transition-colors"
                          >
                            <span>{preset}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {chatMessages.map((msg, msgIdx) => {
                    const isLatestModel =
                      msg.role === 'model' &&
                      msgIdx === chatMessages.length - 1 &&
                      !chatLoading;
                    return (
                      <div key={msg.id} className="space-y-2">
                        <div
                          className={`p-3.5 rounded-2xl text-sm leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-slate-900 text-white ml-8'
                              : 'bg-slate-50 border border-slate-200 text-slate-800 mr-2 space-y-2.5'
                          }`}
                        >
                          {msg.role === 'user' ? (
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                          ) : (
                            <>
                              {renderFormattedCoachText(msg.text)}
                              <div className="pt-2 border-t border-slate-200/70 flex items-center justify-end gap-2">
                                {speechSupported && (
                                  <button
                                    type="button"
                                    onClick={() => toggleSpeak(msg.id, msg.text)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-900 rounded cursor-pointer"
                                  >
                                    {speakingId === msg.id ? (
                                      <>
                                        <Square className="w-3 h-3 text-[#C2410C]" aria-hidden="true" />
                                        Stop
                                      </>
                                    ) : (
                                      <>
                                        <Volume2 className="w-3 h-3" aria-hidden="true" />
                                        Listen
                                      </>
                                    )}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void handleCopyMessage(msg.id, msg.text)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-900 rounded cursor-pointer"
                                >
                                  {copiedMsgId === msg.id ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                                      Copied
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" aria-hidden="true" />
                                      Copy
                                    </>
                                  )}
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                        {isLatestModel && msg.followUps && msg.followUps.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mr-2">
                            {msg.followUps.map((followUp) => (
                              <button
                                key={followUp}
                                type="button"
                                onClick={() => void sendChatMessage(followUp)}
                                className="px-3 py-2 min-h-[44px] text-xs font-medium text-slate-700 bg-white hover:bg-amber-50/70 border border-slate-200 hover:border-[#C2410C] rounded-lg transition-colors cursor-pointer text-left"
                              >
                                {followUp}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {chatLoading && (
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-800 mr-2 leading-relaxed">
                      {streamingText ? (
                        <div>
                          {renderFormattedCoachText(streamingText)}
                          <span
                            aria-hidden="true"
                            className="inline-block w-1.5 h-4 ml-1 align-middle bg-[#C2410C] animate-pulse"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Loader2 className="w-4 h-4 animate-spin text-[#C2410C]" aria-hidden="true" />
                          Drafting answer...
                        </div>
                      )}
                    </div>
                  )}

                  {chatError && (
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-2">
                      <p>{chatError}</p>
                      {failedChatPrompt && (
                        <button
                          type="button"
                          onClick={() => void sendChatMessage(failedChatPrompt, true)}
                          className="inline-flex items-center gap-1.5 px-3 min-h-[44px] font-semibold bg-white border border-rose-300 text-rose-800 hover:bg-rose-100 rounded-lg cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" aria-hidden="true" />
                          Retry Message
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Subtle Session Sync & Privacy Footer Note inside Drawer */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                <div className="flex items-center gap-1.5 min-w-0">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {isCloudSignedIn
                      ? cloudSyncStatus === 'error'
                        ? 'Cloud sync paused · Saved locally'
                        : cloudSyncStatus === 'syncing' || cloudSyncStatus === 'connecting'
                        ? 'Syncing Coach to Cloud Firestore...'
                        : `Synced to Cloud Firestore${
                            lastSyncedAt
                              ? ` · ${new Date(lastSyncedAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}`
                              : ''
                          }`
                      : 'Scoped to CLF-C02 prep · Sign in on Overview to sync devices'}
                  </span>
                </div>
                {isCloudSignedIn && onSyncNow && (
                  <button
                    type="button"
                    disabled={cloudSyncStatus === 'syncing' || cloudSyncStatus === 'connecting'}
                    onClick={() => {
                      triggerSelectionHaptic();
                      onSyncNow();
                    }}
                    className="font-semibold text-[#C2410C] hover:underline whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {cloudSyncStatus === 'error' ? 'Retry Sync' : 'Sync now'}
                  </button>
                )}
              </div>
            </div>

            {/* Bottom Chat Input Bar when Ask Coach tab is active */}
            {tab === 'chat' && (
              <form
                onSubmit={handleChatSubmit}
                className="p-3.5 border-t border-slate-200 bg-white flex items-center gap-2 shrink-0"
              >
                <input
                  type="text"
                  maxLength={500}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask your study coach..."
                  aria-label="Message study coach"
                  className="flex-1 px-3.5 min-h-[44px] text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#C2410C]"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || chatLoading}
                  aria-label="Send message"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-[#C2410C] hover:bg-[#9A3412] text-white disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
