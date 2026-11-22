import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  HelpCircle,
  KeyRound,
  Lightbulb,
  MessageSquare,
  RotateCw,
  Shuffle,
  Square,
  Vibrate,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import { EXAM_DOMAINS } from '../data/awsServices';
import { FLASHCARDS } from '../data/flashcards';
import { DomainId, Flashcard, SrsGrade, SrsItemState } from '../data/types';
import {
  isSoundEnabled,
  playComboSuccessSound,
  playFailureSound,
  playNeutralTap,
  playSuccessSound,
  setSoundEnabled,
  SOUND_PREF_EVENT,
} from '../utils/audio';
import {
  HAPTICS_PREF_EVENT,
  isHapticsEnabled,
  setHapticsEnabled,
  triggerComboHaptic,
  triggerCorrectHaptic,
  triggerIncorrectHaptic,
  triggerSelectionHaptic,
} from '../utils/haptics';
import { ActiveStudyContext } from '../utils/coachProgress';
import {
  formatDueStatus,
  formatIntervalLabel,
  getEarliestNextDueLabel,
  isItemDue,
  isItemScheduledFuture,
  previewNextIntervals,
} from '../utils/spacedRepetition';
import { ProAudioPlayer } from './ProAudioPlayer';

interface FlashcardsSectionProps {
  srsMap: Record<string, SrsItemState>;
  onGradeCard: (cardId: string, grade: SrsGrade) => void;
  onResetDeck: () => void;
  onContextChange?: (ctx: ActiveStudyContext) => void;
  onRequestHint?: () => void;
  onAskCoachCard?: (card: Flashcard, isAnswerVisible: boolean) => void;
}

type CardFilterMode = 'due' | 'hard' | 'lapsed' | 'all';

interface BackSegment {
  label?: string;
  body: string;
}

interface ChoiceOption {
  id: string;
  label: string;
  isCorrect: boolean;
  sourceFront: string;
}

function isCardHard(state: SrsItemState | undefined): boolean {
  if (!state) return false;
  return (
    state.lapses > 0 ||
    state.lastGrade === 'again' ||
    state.lastGrade === 'hard' ||
    state.easeFactor < 2.25
  );
}

function deterministicHash(input: string, seed = 17): number {
  let h = seed * 2654435761;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 2246822519) >>> 0;
  }
  return h;
}

function parseBackSegments(back: string): BackSegment[] {
  const parts = back
    .split(/\s+·\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return parts.map((part) => {
    const colonIdx = part.indexOf(':');
    if (colonIdx > 1 && colonIdx <= 42) {
      return {
        label: part.slice(0, colonIdx).trim(),
        body: part.slice(colonIdx + 1).trim(),
      };
    }
    return { body: part };
  });
}

function extractKeyTermAnchors(card: Flashcard): string {
  const segments = parseBackSegments(card.back);
  const labeled = segments.filter((s) => Boolean(s.label));
  if (labeled.length >= 2) {
    return `${labeled.length} concepts to contrast: ${labeled
      .map((s) => s.label)
      .join(' · ')}`;
  }

  if (segments.length >= 3) {
    const starters = segments.map((s) => {
      const words = s.body.split(/\s+/).slice(0, 3).join(' ');
      return `${words}...`;
    });
    return `${segments.length} parts: ${starters.join(' · ')}`;
  }

  const keyTokens = card.back.match(
    /\b(?:\d+(?:\.\d+)?%?(?:\s*(?:nines|9s|TB|GB|min|minutes|hr|hrs|hours|ms|yr|yrs|days))?|AWS\s+[A-Z][A-Za-z0-9-]+|Amazon\s+[A-Z][A-Za-z0-9-]+|[A-Z]{2,}[A-Za-z0-9-]*)\b/g
  );
  const uniqueTokens = Array.from(new Set(keyTokens || []))
    .filter((t) => !card.front.includes(t))
    .slice(0, 5);

  if (uniqueTokens.length >= 2) {
    return `Key anchors: ${uniqueTokens.join(' · ')}`;
  }

  const openingWords = card.back.split(/\s+/).slice(0, 6).join(' ');
  return `Starts with: "${openingWords}..."`;
}

function summarizeOptionText(back: string): string {
  const clean = back.replace(/\s+·\s+/g, ' — ').trim();
  if (clean.length <= 165) return clean;
  return `${clean.slice(0, 162).trimEnd()}...`;
}

function buildChoiceOptions(card: Flashcard): ChoiceOption[] {
  const sameCategory = FLASHCARDS.filter(
    (c) => c.id !== card.id && c.category === card.category
  );
  const sameDomain = FLASHCARDS.filter(
    (c) => c.id !== card.id && c.domain === card.domain && c.category !== card.category
  );
  const others = FLASHCARDS.filter(
    (c) => c.id !== card.id && c.domain !== card.domain
  );

  const sortByCardHash = (list: Flashcard[], offset: number) =>
    [...list].sort(
      (a, b) =>
        deterministicHash(`${card.id}:${a.id}`, offset) -
        deterministicHash(`${card.id}:${b.id}`, offset)
    );

  const distractorPool = [
    ...sortByCardHash(sameCategory, 11),
    ...sortByCardHash(sameDomain, 23),
    ...sortByCardHash(others, 37),
  ].slice(0, 3);

  const rawOptions: ChoiceOption[] = [
    {
      id: card.id,
      label: summarizeOptionText(card.back),
      isCorrect: true,
      sourceFront: card.front,
    },
    ...distractorPool.map((d) => ({
      id: d.id,
      label: summarizeOptionText(d.back),
      isCorrect: false,
      sourceFront: d.front,
    })),
  ];

  return rawOptions.sort(
    (a, b) =>
      deterministicHash(`opt:${card.id}:${a.id}`, 53) -
      deterministicHash(`opt:${card.id}:${b.id}`, 53)
  );
}

export function FlashcardsSection({
  srsMap,
  onGradeCard,
  onResetDeck,
  onContextChange,
  onRequestHint,
  onAskCoachCard,
}: FlashcardsSectionProps) {
  const [domainFilter, setDomainFilter] = useState<DomainId | 'all'>('all');
  const [studyFilter, setStudyFilter] = useState<CardFilterMode>('due');
  const [shuffleSeed, setShuffleSeed] = useState<number>(0);
  const [deferredIds, setDeferredIds] = useState<string[]>([]);
  const [cardIndex, setCardIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [showHint, setShowHint] = useState<boolean>(false);
  const [showKeyTerms, setShowKeyTerms] = useState<boolean>(false);
  const [choiceAssistOpen, setChoiceAssistOpen] = useState<boolean>(false);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [sessionStreak, setSessionStreak] = useState<number>(0);
  const [soundOn, setSoundOn] = useState<boolean>(isSoundEnabled);
  const [hapticsOn, setHapticsOn] = useState<boolean>(isHapticsEnabled);
  const [confirmReset, setConfirmReset] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  const speechSupported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined';

  const stopSpeech = useCallback(() => {
    if (speechSupported) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore speech cancel quirks
      }
    }
    setIsSpeaking(false);
  }, [speechSupported]);

  useEffect(() => {
    const onPrefChange = () => setSoundOn(isSoundEnabled());
    const onHapticsPrefChange = () => setHapticsOn(isHapticsEnabled());
    window.addEventListener(SOUND_PREF_EVENT, onPrefChange);
    window.addEventListener(HAPTICS_PREF_EVENT, onHapticsPrefChange);
    return () => {
      window.removeEventListener(SOUND_PREF_EVENT, onPrefChange);
      window.removeEventListener(HAPTICS_PREF_EVENT, onHapticsPrefChange);
      stopSpeech();
    };
  }, [stopSpeech]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playNeutralTap();
  };

  const toggleHaptics = () => {
    const next = !hapticsOn;
    setHapticsOn(next);
    setHapticsEnabled(next);
    if (next) triggerSelectionHaptic();
  };

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState<number>(0);

  const now = useMemo(() => new Date(), [srsMap, studyFilter, domainFilter]);

  const domainCards = useMemo(
    () =>
      FLASHCARDS.filter(
        (c) => domainFilter === 'all' || c.domain === domainFilter
      ),
    [domainFilter]
  );

  const dueCountInScope = useMemo(
    () => domainCards.filter((c) => isItemDue(srsMap[c.id], now)).length,
    [domainCards, srsMap, now]
  );

  const hardCountInScope = useMemo(
    () => domainCards.filter((c) => isCardHard(srsMap[c.id])).length,
    [domainCards, srsMap]
  );

  const deck = useMemo(() => {
    let cards = domainCards.filter((c) => {
      const state = srsMap[c.id];
      if (studyFilter === 'due') return isItemDue(state, now);
      if (studyFilter === 'hard') return isCardHard(state);
      if (studyFilter === 'lapsed')
        return Boolean(state && (state.lastGrade === 'again' || state.lapses > 0));
      return true;
    });

    if (studyFilter === 'due') {
      cards = [...cards].sort((a, b) => {
        const defA = deferredIds.indexOf(a.id);
        const defB = deferredIds.indexOf(b.id);
        if (defA !== defB) {
          if (defA === -1) return -1;
          if (defB === -1) return 1;
          return defA - defB;
        }
        const stA = srsMap[a.id];
        const stB = srsMap[b.id];
        if (stA && !stB) return -1;
        if (!stA && stB) return 1;
        if (stA && stB) {
          return new Date(stA.dueAtIso).getTime() - new Date(stB.dueAtIso).getTime();
        }
        return 0;
      });
    } else if (studyFilter === 'hard') {
      cards = [...cards].sort((a, b) => {
        const stA = srsMap[a.id];
        const stB = srsMap[b.id];
        const lapsesDiff = (stB?.lapses ?? 0) - (stA?.lapses ?? 0);
        if (lapsesDiff !== 0) return lapsesDiff;
        return (stA?.easeFactor ?? 2.5) - (stB?.easeFactor ?? 2.5);
      });
    }

    if (shuffleSeed > 0) {
      cards = [...cards].sort(
        (a, b) =>
          deterministicHash(a.id, shuffleSeed) -
          deterministicHash(b.id, shuffleSeed)
      );
    }

    return cards;
  }, [domainCards, srsMap, studyFilter, now, shuffleSeed, deferredIds]);

  const safeIndex = deck.length > 0 ? Math.min(cardIndex, deck.length - 1) : 0;
  const currentCard = deck[safeIndex];
  const currentSrs = currentCard ? srsMap[currentCard.id] : undefined;
  const currentIsHard = isCardHard(currentSrs);

  const backSegments = useMemo(
    () => (currentCard ? parseBackSegments(currentCard.back) : []),
    [currentCard]
  );

  const keyTermAnchor = useMemo(
    () => (currentCard ? extractKeyTermAnchors(currentCard) : ''),
    [currentCard]
  );

  const choiceOptions = useMemo(
    () => (currentCard ? buildChoiceOptions(currentCard) : []),
    [currentCard]
  );

  // Reset per-card scaffolds cleanly when advancing to a different card
  useEffect(() => {
    setSelectedChoiceId(null);
    stopSpeech();
  }, [currentCard?.id, stopSpeech]);

  useEffect(() => {
    if (currentCard) {
      const dom = EXAM_DOMAINS.find((d) => d.id === currentCard.domain)?.title;
      onContextChange?.({
        type: 'flashcard',
        title: currentCard.front,
        details: isFlipped
          ? `Category: ${currentCard.category}. Card flipped (answer visible). Exam Tip: ${currentCard.examTip}`
          : `Category: ${currentCard.category}. Card front only (answer hidden). Hint: ${currentCard.hint}`,
        domainTitle: dom,
        isAnswerVisible: isFlipped,
      });
    }
  }, [currentCard?.id, isFlipped]);

  const intervalPreview = useMemo(
    () => previewNextIntervals(currentSrs, new Date()),
    [currentSrs]
  );

  const clearCardScaffolds = useCallback(() => {
    setIsFlipped(false);
    setShowHint(false);
    setShowKeyTerms(false);
    setSelectedChoiceId(null);
  }, []);

  const goNext = useCallback(() => {
    clearCardScaffolds();
    setCardIndex((prev) => (deck.length > 0 ? (prev + 1) % deck.length : 0));
  }, [clearCardScaffolds, deck.length]);

  const goPrev = useCallback(() => {
    clearCardScaffolds();
    setCardIndex((prev) =>
      deck.length > 0 ? (prev - 1 + deck.length) % deck.length : 0
    );
  }, [clearCardScaffolds, deck.length]);

  const handleGrade = useCallback(
    (grade: SrsGrade) => {
      if (!currentCard) return;
      if (grade === 'again') {
        setSessionStreak(0);
        playFailureSound();
        triggerIncorrectHaptic();
      } else if (grade === 'hard') {
        setSessionStreak(0);
        playNeutralTap();
        triggerSelectionHaptic();
      } else {
        const nextStreak = sessionStreak + 1;
        setSessionStreak(nextStreak);
        if (nextStreak >= 2) {
          playComboSuccessSound(nextStreak);
          triggerComboHaptic(nextStreak);
        } else {
          playSuccessSound();
          triggerCorrectHaptic();
        }
      }
      const gradedId = currentCard.id;
      onGradeCard(gradedId, grade);
      clearCardScaffolds();

      if (grade === 'again') {
        setDeferredIds((prev) => [...prev.filter((id) => id !== gradedId), gradedId]);
      } else {
        setDeferredIds((prev) => prev.filter((id) => id !== gradedId));
        if (studyFilter !== 'due' && deck.length > 1) {
          setCardIndex((prev) => (prev + 1) % deck.length);
        } else {
          setCardIndex((prev) => (prev >= deck.length - 1 ? 0 : prev));
        }
      }
    },
    [clearCardScaffolds, currentCard, deck.length, onGradeCard, sessionStreak, studyFilter]
  );

  const handleSpeakCard = useCallback(() => {
    if (!speechSupported || !currentCard) return;
    triggerSelectionHaptic();
    if (isSpeaking) {
      stopSpeech();
      return;
    }
    stopSpeech();
    try {
      const textToSpeak = isFlipped
        ? `${currentCard.back.replace(/\s+·\s+/g, '. ')}. Exam tip: ${currentCard.examTip}`
        : `${currentCard.front}${showHint ? `. Hint: ${currentCard.hint}` : ''}`;
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = 1.02;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    } catch {
      setIsSpeaking(false);
    }
  }, [currentCard, isFlipped, isSpeaking, showHint, speechSupported, stopSpeech]);

  const handleSelectChoice = (opt: ChoiceOption) => {
    if (selectedChoiceId === opt.id) return;
    setSelectedChoiceId(opt.id);
    if (opt.isCorrect) {
      playSuccessSound();
      triggerCorrectHaptic();
    } else {
      playFailureSound();
      triggerIncorrectHaptic();
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (
        e.code === 'Space' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key.toLowerCase() === 'f'
      ) {
        e.preventDefault();
        playNeutralTap();
        triggerSelectionHaptic();
        setIsFlipped((f) => !f);
      } else if (e.key.toLowerCase() === 'h') {
        setShowHint((h) => !h);
      } else if (e.key.toLowerCase() === 'c') {
        setChoiceAssistOpen((c) => !c);
      } else if (e.key === 'ArrowRight') {
        goNext();
      } else if (e.key === 'ArrowLeft') {
        goPrev();
      } else if (e.key === '1') {
        handleGrade('again');
      } else if (e.key === '2') {
        handleGrade('hard');
      } else if (e.key === '3') {
        handleGrade('good');
      } else if (e.key === '4') {
        handleGrade('easy');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, handleGrade]);

  const scheduledInDomainCount = useMemo(
    () => domainCards.filter((c) => isItemScheduledFuture(srsMap[c.id], now)).length,
    [domainCards, srsMap, now]
  );
  const domainRetentionPct = domainCards.length
    ? Math.round((scheduledInDomainCount / domainCards.length) * 100)
    : 0;

  const scheduledCount = FLASHCARDS.filter((c) => isItemScheduledFuture(srsMap[c.id], now)).length;
  const longTermCount = FLASHCARDS.filter(
    (c) => (srsMap[c.id]?.intervalDays ?? 0) >= 6
  ).length;
  const earliestNext = getEarliestNextDueLabel(
    srsMap,
    domainCards.map((c) => c.id),
    now
  );

  const selectedChoiceOption = choiceOptions.find((o) => o.id === selectedChoiceId) || null;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header + SM-2 Queue Summary */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 text-balance">
            Spaced Repetition Flashcards
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
            Tap card to flip, use Key Terms or 4-Choice Assist when stuck on hard comparisons, and
            rate recall to expand SM-2 intervals.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 sm:gap-5 text-xs font-mono tabular-nums text-slate-600">
          <span>
            Due Now: <strong className="text-[#C2410C]">{dueCountInScope}</strong>
          </span>
          <span>
            Hard: <strong className="text-amber-700">{hardCountInScope}</strong>
          </span>
          <span>
            Scheduled: <strong className="text-slate-900">{scheduledCount}</strong>
          </span>
          <span>
            Long-Term (6d+): <strong className="text-emerald-700">{longTermCount}</strong>
          </span>
        </div>
      </div>

      {/* Filter & Deck Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <select
            aria-label="Filter flashcards by domain"
            value={domainFilter}
            onChange={(e) => {
              setDomainFilter(e.target.value as DomainId | 'all');
              setCardIndex(0);
              clearCardScaffolds();
            }}
            className="w-full sm:w-auto px-3 min-h-[44px] text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-[#C2410C]"
          >
            <option value="all">All 4 Domains ({FLASHCARDS.length} cards)</option>
            {EXAM_DOMAINS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.number}. {d.title}
              </option>
            ))}
          </select>

          <div className="flex p-1 bg-slate-100 rounded-lg overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => {
                setStudyFilter('due');
                setCardIndex(0);
                clearCardScaffolds();
              }}
              className={`flex-1 sm:flex-initial px-3 min-h-[44px] text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
                studyFilter === 'due'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Due ({dueCountInScope})
            </button>
            <button
              type="button"
              onClick={() => {
                setStudyFilter('hard');
                setCardIndex(0);
                clearCardScaffolds();
              }}
              className={`flex-1 sm:flex-initial px-3 min-h-[44px] text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
                studyFilter === 'hard'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hard ({hardCountInScope})
            </button>
            <button
              type="button"
              onClick={() => {
                setStudyFilter('lapsed');
                setCardIndex(0);
                clearCardScaffolds();
              }}
              className={`flex-1 sm:flex-initial px-3 min-h-[44px] text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap shrink-0 ${
                studyFilter === 'lapsed'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Needs Review
            </button>
            <button
              type="button"
              onClick={() => {
                setStudyFilter('all');
                setCardIndex(0);
                clearCardScaffolds();
              }}
              className={`flex-1 sm:flex-initial px-3 min-h-[44px] text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap shrink-0 ${
                studyFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Cards
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleHaptics}
            aria-pressed={hapticsOn}
            aria-label={hapticsOn ? 'Disable haptic feedback' : 'Enable haptic feedback'}
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] px-2.5 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg cursor-pointer shrink-0"
          >
            <Vibrate
              className={`w-4 h-4 ${hapticsOn ? 'text-[#C2410C]' : 'text-slate-400'}`}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            onClick={toggleSound}
            aria-label={soundOn ? 'Mute sound effects' : 'Enable sound effects'}
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] px-2.5 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg cursor-pointer shrink-0"
          >
            {soundOn ? (
              <Volume2 className="w-4 h-4 text-[#C2410C]" aria-hidden="true" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setShuffleSeed((s) => s + 1);
              setCardIndex(0);
              clearCardScaffolds();
            }}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
          >
            <Shuffle className="w-3.5 h-3.5" aria-hidden="true" />
            Shuffle
          </button>
          {confirmReset ? (
            <div className="flex flex-1 sm:flex-initial items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onResetDeck();
                  setDeferredIds([]);
                  setStudyFilter('due');
                  setCardIndex(0);
                  clearCardScaffolds();
                  setConfirmReset(false);
                }}
                className="flex-1 sm:flex-initial px-3 min-h-[44px] text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
              >
                Confirm Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-3 min-h-[44px] text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="flex-1 sm:flex-initial px-3 min-h-[44px] text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
            >
              Reset Schedule
            </button>
          )}
        </div>
      </div>

      {/* Empty state when queue is clear */}
      {!currentCard ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 sm:p-12 text-center space-y-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 mx-auto">
            <Clock className="w-5 h-5" aria-hidden="true" />
          </div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            {studyFilter === 'due'
              ? 'All due flashcards reviewed for now'
              : studyFilter === 'hard'
              ? 'No hard cards flagged yet'
              : 'No cards match this filter'}
          </h2>
          <p className="text-sm text-slate-600">
            {studyFilter === 'due' && earliestNext
              ? `Next scheduled review returns in ${earliestNext}. You can still browse the full deck anytime.`
              : studyFilter === 'hard'
              ? 'Cards you grade Again or Hard appear here for focused scaffolded drills.'
              : 'Switch to All Cards to review any topic on demand.'}
          </p>
          <button
            type="button"
            onClick={() => setStudyFilter('all')}
            className="mt-2 px-5 min-h-[44px] text-xs font-semibold bg-[#C2410C] text-white rounded-lg cursor-pointer"
          >
            Browse All Cards
          </button>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto space-y-4 sm:space-y-5">
          {/* Card Progress & Domain Retention Bar */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 font-mono tabular-nums">
              <span>
                {safeIndex + 1}/{deck.length} · {formatDueStatus(currentSrs, now)}
                {currentIsHard ? ' · Hard Card' : ''}
                {sessionStreak >= 2 ? ` · Streak ${sessionStreak}` : ''}
              </span>
              <span>
                {currentCard.category} · {scheduledInDomainCount}/{domainCards.length} locked
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all duration-300"
                style={{ width: `${domainRetentionPct}%` }}
              />
            </div>
          </div>

          {/* 3D Flip Card Stage with Compositor Horizontal Touch Swipe */}
          <div
            className="perspective-1000"
            style={{
              transform: dragOffsetX !== 0 ? `translate3d(${dragOffsetX}px, 0, 0)` : undefined,
              transition: dragOffsetX === 0 ? 'transform 160ms ease-out' : 'none',
            }}
            onTouchStart={(e) => {
              touchStartX.current = e.changedTouches[0].clientX;
              touchStartY.current = e.changedTouches[0].clientY;
              setDragOffsetX(0);
            }}
            onTouchMove={(e) => {
              if (touchStartX.current === null || touchStartY.current === null) return;
              const dx = e.changedTouches[0].clientX - touchStartX.current;
              const dy = e.changedTouches[0].clientY - touchStartY.current;
              if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.25) {
                setDragOffsetX(Math.max(-20, Math.min(20, dx * 0.25)));
              }
            }}
            onTouchCancel={() => {
              touchStartX.current = null;
              touchStartY.current = null;
              setDragOffsetX(0);
            }}
            onTouchEnd={(e) => {
              if (touchStartX.current === null || touchStartY.current === null) return;
              const dx = e.changedTouches[0].clientX - touchStartX.current;
              const dy = e.changedTouches[0].clientY - touchStartY.current;
              touchStartX.current = null;
              touchStartY.current = null;
              setDragOffsetX(0);
              if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
                if (dx < 0) goNext();
                else goPrev();
              }
            }}
          >
            <div
              role="button"
              tabIndex={0}
              aria-label={
                isFlipped
                  ? 'Flashcard answer side, tap to flip back'
                  : 'Flashcard prompt side, tap to reveal answer'
              }
              onClick={() => {
                playNeutralTap();
                triggerSelectionHaptic();
                setIsFlipped((f) => !f);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  playNeutralTap();
                  triggerSelectionHaptic();
                  setIsFlipped((f) => !f);
                }
              }}
              className={`relative w-full h-[380px] sm:h-[395px] preserve-3d flashcard-transition transition-transform duration-300 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C2410C] rounded-2xl ${
                isFlipped ? 'rotate-y-180' : ''
              }`}
            >
              {/* FRONT FACE */}
              <div className="absolute inset-0 backface-hidden bg-white border border-slate-200 rounded-2xl p-5 sm:p-8 flex flex-col justify-between overflow-hidden">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span>Tap to flip</span>
                    {speechSupported && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSpeakCard();
                        }}
                        aria-label={isSpeaking ? 'Stop audio' : 'Read prompt aloud'}
                        className="inline-flex items-center gap-1 min-h-[44px] px-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer shrink-0"
                      >
                        {isSpeaking ? (
                          <Square className="w-3 h-3 text-[#C2410C]" aria-hidden="true" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        <span>{isSpeaking ? 'Stop' : 'Listen'}</span>
                      </button>
                    )}
                  </div>
                  <span className="font-mono tabular-nums truncate">
                    {currentSrs
                      ? `Ease ${currentSrs.easeFactor.toFixed(2)} · ${formatIntervalLabel(currentSrs.intervalDays)}`
                      : 'New Card'}
                  </span>
                </div>

                <div className="my-auto py-3 text-center space-y-3 overflow-y-auto px-1">
                  <h2 className="font-display text-lg sm:text-2xl font-bold text-slate-900 leading-snug text-balance">
                    {currentCard.front}
                  </h2>

                  {showHint && (
                    <div className="text-xs sm:text-sm text-amber-900 bg-amber-50 border border-amber-200 px-3.5 py-2 rounded-xl inline-block text-left max-w-xl">
                      <strong className="font-semibold">Hint: </strong>
                      {currentCard.hint}
                    </div>
                  )}

                  {showKeyTerms && (
                    <div className="text-xs sm:text-sm text-sky-900 bg-sky-50 border border-sky-200 px-3.5 py-2 rounded-xl inline-block text-left max-w-xl">
                      <strong className="font-semibold">Memory Anchor: </strong>
                      {keyTermAnchor}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 shrink-0 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1 sm:gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerSelectionHaptic();
                        setShowHint((h) => !h);
                      }}
                      className={`inline-flex items-center gap-1.5 min-h-[44px] px-2.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap shrink-0 ${
                        showHint
                          ? 'bg-amber-50 text-amber-900'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      {showHint ? 'Hide Hint' : 'Hint'}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerSelectionHaptic();
                        setShowKeyTerms((k) => !k);
                      }}
                      className={`inline-flex items-center gap-1.5 min-h-[44px] px-2.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap shrink-0 ${
                        showKeyTerms
                          ? 'bg-sky-50 text-sky-900'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                      {showKeyTerms ? 'Hide Anchor' : 'Key Terms'}
                    </button>
                    {onRequestHint && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerSelectionHaptic();
                          onRequestHint();
                        }}
                        className="inline-flex items-center gap-1 min-h-[44px] px-2.5 text-xs font-semibold text-[#C2410C] hover:bg-amber-50 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
                        Coach Clue
                      </button>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C2410C] whitespace-nowrap shrink-0">
                    <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                    Reveal Answer
                  </span>
                </div>
              </div>

              {/* BACK FACE (Structured Scannable Answer Breakdown + Exam Tip + Coach Deep-Dive) */}
              <div className="absolute inset-0 backface-hidden rotate-y-180 bg-slate-900 text-white border border-slate-800 rounded-2xl p-5 sm:p-8 flex flex-col justify-between overflow-hidden">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-400 shrink-0">
                  <div className="flex items-center gap-2">
                    <span>Tap to flip back</span>
                    {speechSupported && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSpeakCard();
                        }}
                        aria-label={isSpeaking ? 'Stop audio' : 'Read answer aloud'}
                        className="inline-flex items-center gap-1 min-h-[44px] px-2.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-md cursor-pointer"
                      >
                        {isSpeaking ? (
                          <Square className="w-3 h-3 text-amber-400" aria-hidden="true" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        <span>{isSpeaking ? 'Stop' : 'Listen'}</span>
                      </button>
                    )}
                  </div>
                  <span className="font-mono tabular-nums">
                    {currentSrs
                      ? `Streak ${currentSrs.repetitions} · Lapses ${currentSrs.lapses}`
                      : 'First Review'}
                  </span>
                </div>

                <div className="my-auto py-2.5 space-y-3 overflow-y-auto pr-1">
                  {backSegments.length > 1 ? (
                    <ul className="space-y-2 text-left">
                      {backSegments.map((seg, idx) => (
                        <li
                          key={idx}
                          className="text-xs sm:text-sm text-slate-100 leading-relaxed flex items-start gap-2"
                        >
                          <span aria-hidden="true" className="text-amber-400 font-bold shrink-0">
                            ·
                          </span>
                          <span>
                            {seg.label ? (
                              <>
                                <strong className="font-semibold text-amber-300">
                                  {seg.label}:{' '}
                                </strong>
                                {seg.body}
                              </>
                            ) : (
                              seg.body
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm sm:text-lg font-medium text-slate-100 leading-relaxed">
                      {currentCard.back}
                    </p>
                  )}

                  <div className="p-3 rounded-xl bg-slate-800/90 text-xs text-amber-200 leading-relaxed">
                    <strong className="text-amber-400">Exam Tip: </strong>
                    {currentCard.examTip}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 shrink-0 pt-2 border-t border-slate-800">
                  {onAskCoachCard ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerSelectionHaptic();
                        onAskCoachCard(currentCard, true);
                      }}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-2.5 text-xs font-semibold text-amber-300 hover:text-amber-200 hover:bg-slate-800 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                      Ask Coach Memory Hook
                    </button>
                  ) : (
                    <span />
                  )}
                  <span className="text-xs text-slate-400">Rate recall below</span>
                </div>
              </div>
            </div>
          </div>

          <ProAudioPlayer
            compact
            lessonType="flashcard"
            lessonId={`${currentCard.id}-${isFlipped ? 'back' : 'front'}`}
            title={currentCard.front}
            summary={
              isFlipped
                ? currentCard.back.replace(/\s+·\s+/g, '. ')
                : `Prompt: ${currentCard.front}. Hint: ${currentCard.hint}`
            }
            facts={isFlipped ? [currentCard.category, currentCard.hint] : [currentCard.category]}
            examTip={isFlipped ? currentCard.examTip : undefined}
          />

          {/* Hard-Question Recall Assist Bar (Choice Assist Toggle + Quick Self-Check) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <HelpCircle className="w-4 h-4 text-[#C2410C] shrink-0" aria-hidden="true" />
                <span className="text-xs sm:text-sm font-semibold text-slate-900">
                  {currentIsHard
                    ? 'Tough card? Narrow it down with 4-Choice Assist before flipping'
                    : 'Recall Check · Need help answering?'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerSelectionHaptic();
                  setChoiceAssistOpen((o) => !o);
                }}
                aria-expanded={choiceAssistOpen}
                className={`px-3.5 min-h-[44px] text-xs font-semibold rounded-xl border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  choiceAssistOpen
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                }`}
              >
                {choiceAssistOpen ? 'Hide Choice Assist' : 'Try 4-Choice Assist'}
              </button>
            </div>

            {choiceAssistOpen && (
              <div className="pt-2 border-t border-slate-100 space-y-2.5">
                <p className="text-xs text-slate-500">
                  Pick the matching AWS definition for this prompt—wrong picks show what service
                  they actually belong to.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {choiceOptions.map((opt, idx) => {
                    const isSelected = selectedChoiceId === opt.id;
                    let styleClass =
                      'bg-slate-50 hover:bg-white border-slate-200 hover:border-slate-400 text-slate-800';
                    if (isSelected && opt.isCorrect) {
                      styleClass =
                        'bg-emerald-50 border-emerald-500 text-emerald-950 ring-1 ring-emerald-500';
                    } else if (isSelected && !opt.isCorrect) {
                      styleClass =
                        'bg-rose-50 border-rose-400 text-rose-950 ring-1 ring-rose-400';
                    } else if (selectedChoiceOption?.isCorrect && opt.isCorrect) {
                      styleClass = 'bg-emerald-50 border-emerald-400 text-emerald-950';
                    }

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectChoice(opt)}
                        className={`text-left p-3.5 min-h-[56px] rounded-xl border text-xs leading-relaxed transition-colors cursor-pointer flex items-start gap-2.5 ${styleClass}`}
                      >
                        <span className="font-mono font-bold text-slate-500 shrink-0 mt-0.5">
                          {String.fromCharCode(65 + idx)}.
                        </span>
                        <span className="flex-1">{opt.label}</span>
                        {isSelected && opt.isCorrect && (
                          <CheckCircle2
                            className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                        )}
                        {isSelected && !opt.isCorrect && (
                          <XCircle
                            className="w-4 h-4 text-rose-600 shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                {selectedChoiceOption && (
                  <div
                    role="status"
                    className={`p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
                      selectedChoiceOption.isCorrect
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-rose-50 border-rose-200 text-rose-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {selectedChoiceOption.isCorrect ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-600 shrink-0" aria-hidden="true" />
                      )}
                      <span>
                        {selectedChoiceOption.isCorrect
                          ? 'Correct match! Flip the card to lock in the Exam Tip or rate Hard/Good.'
                          : `Not quite — that option defines "${selectedChoiceOption.sourceFront}".`}
                      </span>
                    </div>
                    {!isFlipped && (
                      <button
                        type="button"
                        onClick={() => {
                          playNeutralTap();
                          triggerSelectionHaptic();
                          setIsFlipped(true);
                        }}
                        className="px-3 min-h-[44px] font-semibold bg-white border border-slate-200 text-slate-900 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Flip Card
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Thumb-Friendly SM-2 Grade Rating Grid + Prev/Next */}
          <div className="space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between gap-4">
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 font-mono tabular-nums sm:order-2">
              <button
                type="button"
                onClick={() => handleGrade('again')}
                className={`min-h-[48px] px-3 text-xs font-semibold rounded-xl border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 active:scale-[0.98] transition-all cursor-pointer ${
                  isFlipped ? 'ring-1 ring-rose-300' : ''
                }`}
              >
                1 · Again ({intervalPreview.again})
              </button>
              <button
                type="button"
                onClick={() => handleGrade('hard')}
                className={`min-h-[48px] px-3 text-xs font-semibold rounded-xl border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 active:scale-[0.98] transition-all cursor-pointer ${
                  isFlipped ? 'ring-1 ring-amber-300' : ''
                }`}
              >
                2 · Hard ({intervalPreview.hard})
              </button>
              <button
                type="button"
                onClick={() => handleGrade('good')}
                className={`min-h-[48px] px-3 text-xs font-semibold rounded-xl border border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 active:scale-[0.98] transition-all cursor-pointer ${
                  isFlipped ? 'ring-1 ring-sky-300' : ''
                }`}
              >
                3 · Good ({intervalPreview.good})
              </button>
              <button
                type="button"
                onClick={() => handleGrade('easy')}
                className={`min-h-[48px] px-3 text-xs font-semibold rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 active:scale-[0.98] transition-all cursor-pointer ${
                  isFlipped ? 'ring-1 ring-emerald-300' : ''
                }`}
              >
                4 · Easy ({intervalPreview.easy})
              </button>
            </div>

            <div className="flex items-center gap-2 sm:order-1">
              <button
                type="button"
                onClick={goPrev}
                aria-label="Previous flashcard"
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-3.5 min-h-[44px] text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl cursor-pointer whitespace-nowrap shrink-0"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                Prev
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="Next flashcard"
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-3.5 min-h-[44px] text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl cursor-pointer whitespace-nowrap shrink-0"
              >
                Next
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <p className="hidden sm:block text-center text-xs text-slate-500">
            Shortcuts: Space / F flip · H hint · C choice assist · Left/Right navigate · 1 Again · 2 Hard · 3 Good · 4 Easy
          </p>
        </div>
      )}
    </div>
  );
}
