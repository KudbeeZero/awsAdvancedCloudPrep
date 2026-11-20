import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Lightbulb,
  RotateCw,
  Shuffle,
  Vibrate,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { EXAM_DOMAINS } from '../data/awsServices';
import { FLASHCARDS } from '../data/flashcards';
import { DomainId, SrsGrade, SrsItemState } from '../data/types';
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

interface FlashcardsSectionProps {
  srsMap: Record<string, SrsItemState>;
  onGradeCard: (cardId: string, grade: SrsGrade) => void;
  onResetDeck: () => void;
  onContextChange?: (ctx: ActiveStudyContext) => void;
  onRequestHint?: () => void;
}

type CardFilterMode = 'due' | 'all' | 'lapsed';

export function FlashcardsSection({
  srsMap,
  onGradeCard,
  onResetDeck,
  onContextChange,
  onRequestHint,
}: FlashcardsSectionProps) {
  const [domainFilter, setDomainFilter] = useState<DomainId | 'all'>('all');
  const [studyFilter, setStudyFilter] = useState<CardFilterMode>('due');
  const [shuffleSeed, setShuffleSeed] = useState<number>(0);
  const [deferredIds, setDeferredIds] = useState<string[]>([]);
  const [cardIndex, setCardIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [showHint, setShowHint] = useState<boolean>(false);
  const [sessionStreak, setSessionStreak] = useState<number>(0);
  const [soundOn, setSoundOn] = useState<boolean>(isSoundEnabled);
  const [hapticsOn, setHapticsOn] = useState<boolean>(isHapticsEnabled);
  const [confirmReset, setConfirmReset] = useState<boolean>(false);

  useEffect(() => {
    const onPrefChange = () => setSoundOn(isSoundEnabled());
    const onHapticsPrefChange = () => setHapticsOn(isHapticsEnabled());
    window.addEventListener(SOUND_PREF_EVENT, onPrefChange);
    window.addEventListener(HAPTICS_PREF_EVENT, onHapticsPrefChange);
    return () => {
      window.removeEventListener(SOUND_PREF_EVENT, onPrefChange);
      window.removeEventListener(HAPTICS_PREF_EVENT, onHapticsPrefChange);
    };
  }, []);

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

  const deck = useMemo(() => {
    let cards = domainCards.filter((c) => {
      const state = srsMap[c.id];
      if (studyFilter === 'due') return isItemDue(state, now);
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
    }

    if (shuffleSeed > 0) {
      const hashId = (id: string, seed: number) => {
        let h = seed * 2654435761;
        for (let i = 0; i < id.length; i++) {
          h = Math.imul(h ^ id.charCodeAt(i), 2246822519) >>> 0;
        }
        return h;
      };
      cards = [...cards].sort((a, b) => hashId(a.id, shuffleSeed) - hashId(b.id, shuffleSeed));
    }

    return cards;
  }, [domainCards, srsMap, studyFilter, now, shuffleSeed, deferredIds]);

  const safeIndex = deck.length > 0 ? Math.min(cardIndex, deck.length - 1) : 0;
  const currentCard = deck[safeIndex];
  const currentSrs = currentCard ? srsMap[currentCard.id] : undefined;

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

  const goNext = useCallback(() => {
    setIsFlipped(false);
    setShowHint(false);
    setCardIndex((prev) => (deck.length > 0 ? (prev + 1) % deck.length : 0));
  }, [deck.length]);

  const goPrev = useCallback(() => {
    setIsFlipped(false);
    setShowHint(false);
    setCardIndex((prev) => (deck.length > 0 ? (prev - 1 + deck.length) % deck.length : 0));
  }, [deck.length]);

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
      setIsFlipped(false);
      setShowHint(false);

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
    [currentCard, deck.length, onGradeCard, sessionStreak, studyFilter]
  );

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

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header + SM-2 Queue Summary */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Spaced Repetition Flashcards
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
            Tap card to flip, swipe left/right to step, and rate recall to expand your SM-2 review
            intervals.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 sm:gap-5 text-xs font-mono tabular-nums text-slate-600">
          <span>
            Due Now: <strong className="text-[#C2410C]">{dueCountInScope}</strong>
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
              setIsFlipped(false);
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
              }}
              className={`flex-1 sm:flex-initial px-3 min-h-[38px] text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap tabular-nums ${
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
                setStudyFilter('all');
                setCardIndex(0);
              }}
              className={`flex-1 sm:flex-initial px-3 min-h-[38px] text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                studyFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Cards
            </button>
            <button
              type="button"
              onClick={() => {
                setStudyFilter('lapsed');
                setCardIndex(0);
              }}
              className={`flex-1 sm:flex-initial px-3 min-h-[38px] text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                studyFilter === 'lapsed'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Needs Review
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleHaptics}
            aria-pressed={hapticsOn}
            aria-label={hapticsOn ? 'Disable haptic feedback' : 'Enable haptic feedback'}
            className="inline-flex items-center justify-center min-w-[42px] min-h-[42px] px-2.5 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg cursor-pointer"
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
            className="inline-flex items-center justify-center min-w-[42px] min-h-[42px] px-2.5 text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg cursor-pointer"
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
              setIsFlipped(false);
            }}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 min-h-[42px] text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg cursor-pointer"
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
                  setConfirmReset(false);
                }}
                className="flex-1 sm:flex-initial px-3 min-h-[42px] text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg cursor-pointer"
              >
                Confirm Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-3 min-h-[42px] text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="flex-1 sm:flex-initial px-3 min-h-[42px] text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg cursor-pointer"
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
              : 'No cards match this filter'}
          </h2>
          <p className="text-sm text-slate-600">
            {studyFilter === 'due' && earliestNext
              ? `Next scheduled review returns in ${earliestNext}. You can still browse the full deck anytime.`
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
        <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
          {/* Card Progress & Domain Retention Bar */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 font-mono tabular-nums">
              <span>
                {safeIndex + 1}/{deck.length} · {formatDueStatus(currentSrs, now)}
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
              className={`relative w-full h-[320px] sm:h-[360px] preserve-3d flashcard-transition transition-transform duration-300 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C2410C] rounded-xl ${
                isFlipped ? 'rotate-y-180' : ''
              }`}
            >
              {/* FRONT FACE */}
              <div className="absolute inset-0 backface-hidden bg-white border border-slate-200 rounded-xl p-5 sm:p-10 flex flex-col justify-between overflow-hidden">
                <div className="flex items-center justify-between text-xs text-slate-500 shrink-0">
                  <span>Tap to flip</span>
                  <span className="font-mono tabular-nums">
                    {currentSrs
                      ? `Ease ${currentSrs.easeFactor.toFixed(2)} · ${formatIntervalLabel(currentSrs.intervalDays)}`
                      : 'New Card'}
                  </span>
                </div>

                <div className="my-auto py-3 text-center space-y-3 overflow-y-auto">
                  <h2 className="font-display text-lg sm:text-2xl font-bold text-slate-900 leading-snug text-balance">
                    {currentCard.front}
                  </h2>

                  {showHint && (
                    <p className="text-xs sm:text-sm text-amber-800 bg-amber-50 px-3.5 py-2 rounded-lg inline-block">
                      Hint: {currentCard.hint}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between shrink-0 pt-2">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowHint((h) => !h);
                      }}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-2 -ml-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      {showHint ? 'Hide Hint' : 'Hint'}
                    </button>
                    {onRequestHint && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRequestHint();
                        }}
                        className="inline-flex items-center gap-1 min-h-[40px] px-2 text-xs font-semibold text-[#C2410C] hover:underline cursor-pointer"
                      >
                        <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
                        Coach Clue
                      </button>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C2410C]">
                    <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                    Reveal Answer
                  </span>
                </div>
              </div>

              {/* BACK FACE */}
              <div className="absolute inset-0 backface-hidden rotate-y-180 bg-slate-900 text-white border border-slate-800 rounded-xl p-5 sm:p-10 flex flex-col justify-between overflow-hidden">
                <div className="flex items-center justify-between text-xs text-slate-400 shrink-0">
                  <span>Tap to flip back</span>
                  <span className="font-mono tabular-nums">
                    {currentSrs
                      ? `Streak ${currentSrs.repetitions} · Lapses ${currentSrs.lapses}`
                      : 'First Review'}
                  </span>
                </div>

                <div className="my-auto py-3 space-y-3 overflow-y-auto">
                  <p className="text-sm sm:text-lg font-medium text-slate-100 leading-relaxed">
                    {currentCard.back}
                  </p>
                  <div className="p-3 rounded-lg bg-slate-800/90 text-xs text-amber-200 leading-relaxed">
                    <strong className="text-amber-400">Exam Tip: </strong>
                    {currentCard.examTip}
                  </div>
                </div>

                <div className="text-xs text-slate-400 text-right shrink-0 pt-1">
                  Rate recall below
                </div>
              </div>
            </div>
          </div>

          {/* Thumb-Friendly SM-2 Grade Rating Grid + Prev/Next */}
          <div className="space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between gap-4">
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 font-mono tabular-nums sm:order-2">
              <button
                type="button"
                onClick={() => handleGrade('again')}
                className={`min-h-[48px] px-3 text-xs font-semibold rounded-lg border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 active:scale-[0.98] transition-all cursor-pointer ${
                  isFlipped ? 'ring-1 ring-rose-300' : ''
                }`}
              >
                1 · Again ({intervalPreview.again})
              </button>
              <button
                type="button"
                onClick={() => handleGrade('hard')}
                className={`min-h-[48px] px-3 text-xs font-semibold rounded-lg border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 active:scale-[0.98] transition-all cursor-pointer ${
                  isFlipped ? 'ring-1 ring-amber-300' : ''
                }`}
              >
                2 · Hard ({intervalPreview.hard})
              </button>
              <button
                type="button"
                onClick={() => handleGrade('good')}
                className={`min-h-[48px] px-3 text-xs font-semibold rounded-lg border border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 active:scale-[0.98] transition-all cursor-pointer ${
                  isFlipped ? 'ring-1 ring-sky-300' : ''
                }`}
              >
                3 · Good ({intervalPreview.good})
              </button>
              <button
                type="button"
                onClick={() => handleGrade('easy')}
                className={`min-h-[48px] px-3 text-xs font-semibold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 active:scale-[0.98] transition-all cursor-pointer ${
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
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-3.5 min-h-[44px] text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                Prev
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="Next flashcard"
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-3.5 min-h-[44px] text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg cursor-pointer"
              >
                Next
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <p className="hidden sm:block text-center text-xs text-slate-500">
            Shortcuts: Space / F to flip · Left/Right arrows to navigate · 1 Again · 2 Hard · 3 Good · 4 Easy
          </p>
        </div>
      )}
    </div>
  );
}
