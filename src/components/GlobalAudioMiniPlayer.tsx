import { Loader2, Pause, Play, RotateCcw, SkipForward, Volume2, X } from 'lucide-react';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { triggerSelectionHaptic } from '../utils/haptics';

interface GlobalAudioMiniPlayerProps {
  onOpenLesson: (serviceId: string) => void;
}

function formatMiniTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function GlobalAudioMiniPlayer({ onOpenLesson }: GlobalAudioMiniPlayerProps) {
  const {
    activeLesson,
    activeTrack,
    isPlaying,
    isSpeechPlaying,
    isSynthesizing,
    isBuffering,
    currentTime,
    duration,
    inlineOwnerServiceId,
    togglePlayPause,
    skipBy,
    playNextLesson,
    stopAndDismiss,
  } = useAudioPlayer();

  // Hide mini-player when no track/lesson is active OR when the full inline player for this lesson is visible
  const hasVisibleMedia = Boolean(
    activeLesson &&
      (isPlaying || isSpeechPlaying || isSynthesizing || activeTrack?.audioUrl || currentTime > 0)
  );
  const isInlineMountedForThis =
    Boolean(activeLesson) && inlineOwnerServiceId === activeLesson?.serviceId;

  if (!hasVisibleMedia || isInlineMountedForThis || !activeLesson) {
    return null;
  }

  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const isAudioActive = isPlaying || isSpeechPlaying;

  return (
    <aside
      aria-label={`Mini audio player for ${activeLesson.title}`}
      className="sticky top-0 z-30 md:fixed md:top-auto md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:z-40 w-full md:w-[460px] lg:w-[500px] bg-white/95 backdrop-blur-md border-b md:border border-slate-200 md:rounded-2xl md:shadow-xl overflow-hidden"
    >
      {/* Top 2px progress hairline */}
      <div className="h-0.5 w-full bg-slate-100" aria-hidden="true">
        <div
          className="h-full bg-[#C2410C] transition-[width] duration-200"
          style={{ width: `${Math.round(progressRatio * 100)}%` }}
        />
      </div>

      <div className="px-3 sm:px-4 h-[52px] md:h-14 flex items-center justify-between gap-2">
        {/* Tap title to jump straight back to that AWS Service */}
        <button
          type="button"
          onClick={() => {
            triggerSelectionHaptic();
            onOpenLesson(activeLesson.serviceId);
          }}
          className="flex items-center gap-2.5 min-w-0 flex-1 text-left min-h-[44px] cursor-pointer group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C] rounded-lg"
        >
          <span className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200/80 text-[#C2410C] inline-flex items-center justify-center shrink-0">
            <Volume2 className="w-4 h-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs sm:text-sm font-semibold text-slate-900 group-hover:text-[#C2410C] truncate">
              {activeLesson.title}
            </span>
            <span className="block text-[11px] text-slate-500 font-mono tabular-nums truncate">
              {isSynthesizing
                ? 'Preparing studio audio...'
                : duration > 0
                ? `${formatMiniTime(currentTime)} / ${formatMiniTime(duration)}`
                : activeTrack?.voiceLabel || 'Lesson Audio'}
            </span>
          </span>
        </button>

        {/* Compact thumb-friendly transport controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          {activeTrack?.audioMode === 'elevenlabs' && activeTrack.audioUrl && (
            <button
              type="button"
              onClick={() => {
                triggerSelectionHaptic();
                skipBy(-15);
              }}
              aria-label="Rewind 15 seconds"
              className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              triggerSelectionHaptic();
              togglePlayPause();
            }}
            disabled={isSynthesizing}
            aria-label={isAudioActive ? 'Pause lesson audio' : 'Resume lesson audio'}
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 text-white cursor-pointer disabled:opacity-55"
          >
            {isSynthesizing || (isBuffering && isPlaying) ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : isAudioActive ? (
              <Pause className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Play className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          {activeLesson.nextServiceId && (
            <button
              type="button"
              onClick={() => {
                triggerSelectionHaptic();
                playNextLesson();
              }}
              aria-label={
                activeLesson.nextLessonTitle
                  ? `Next lesson: ${activeLesson.nextLessonTitle}`
                  : 'Next lesson'
              }
              className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
            >
              <SkipForward className="w-4 h-4" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              triggerSelectionHaptic();
              stopAndDismiss();
            }}
            aria-label="Close mini audio player"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}
