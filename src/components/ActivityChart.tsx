import { useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Flame, Trophy, Zap } from 'lucide-react';
import { ArcadeStats } from '../data/types';
import { DAILY_XP_GOAL, getLast7DaysActivity, getLocalDateKey } from '../utils/arcade';
import { triggerSelectionHaptic } from '../utils/haptics';

interface ActivityChartProps {
  arcade?: ArcadeStats;
}

export function ActivityChart({ arcade }: ActivityChartProps) {
  const days = useMemo(() => getLast7DaysActivity(arcade), [arcade]);
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => getLocalDateKey());

  const selectedDay = useMemo(
    () => days.find((d) => d.dateKey === selectedDateKey) || days[days.length - 1],
    [days, selectedDateKey]
  );

  const summary = useMemo(() => {
    let totalXp = 0;
    let goalsHit = 0;
    days.forEach((d) => {
      totalXp += d.xp;
      if (d.goalAchieved) goalsHit += 1;
    });
    return { totalXp, goalsHit };
  }, [days]);

  const maxDayXp = useMemo(() => {
    const peak = Math.max(...days.map((d) => d.xp), DAILY_XP_GOAL);
    return Math.max(peak, DAILY_XP_GOAL);
  }, [days]);

  const todayKey = getLocalDateKey();

  return (
    <section
      aria-labelledby="activity-chart-heading"
      className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8 space-y-6"
    >
      {/* Header & Weekly Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#C2410C]" aria-hidden="true" />
            <h2
              id="activity-chart-heading"
              className="font-display text-lg font-bold text-slate-900"
            >
              7-Day Activity &amp; Goal Tracker
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Tap any day bar to inspect daily XP. Daily goal target: {DAILY_XP_GOAL} XP.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums text-slate-700">
          <span className="inline-flex items-center gap-1.5 font-medium text-amber-900">
            <Trophy className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
            {summary.goalsHit} of 7 goals hit
          </span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
            <Zap className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
            {summary.totalXp.toLocaleString()} XP this week
          </span>
        </div>
      </div>

      {/* Tap-Selected Day Summary (Mobile-Friendly Inspector) */}
      {selectedDay && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
          <span className="font-semibold text-slate-900">
            {selectedDay.dayLabel}, {selectedDay.shortDate}
            {selectedDay.dateKey === todayKey ? ' (Today)' : ''}
          </span>
          <span
            className={
              selectedDay.goalAchieved
                ? 'text-emerald-700 font-bold inline-flex items-center gap-1.5'
                : 'text-slate-700 font-semibold'
            }
          >
            {selectedDay.goalAchieved && (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
            {selectedDay.xp.toLocaleString()} XP ·{' '}
            {selectedDay.goalAchieved
              ? 'Goal Achieved'
              : `${selectedDay.pctOfGoal}% of ${DAILY_XP_GOAL} XP`}
          </span>
        </div>
      )}

      {/* Visual Bar Chart Container */}
      <div className="relative pt-8 pb-2">
        {/* Goal Threshold Reference Line */}
        <div
          className="absolute left-0 right-0 border-t border-dashed border-amber-300 z-10 flex items-center justify-between pointer-events-none"
          style={{
            top: `${Math.max(
              16,
              Math.min(
                156,
                156 - (DAILY_XP_GOAL / Math.max(maxDayXp, DAILY_XP_GOAL)) * 134
              )
            )}px`,
          }}
        >
          <span className="bg-white/95 text-amber-800 text-[10px] font-mono font-semibold pr-2 -mt-4">
            {DAILY_XP_GOAL} XP Goal
          </span>
        </div>

        {/* 7 Interactive Day Columns */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-4 items-end h-[170px] relative z-20">
          {days.map((day) => {
            const heightPct = Math.min(
              100,
              Math.round((day.xp / Math.max(maxDayXp, DAILY_XP_GOAL)) * 100)
            );
            const isToday = day.dateKey === todayKey;
            const isSelected = day.dateKey === selectedDay?.dateKey;

            return (
              <button
                key={day.dateKey}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${day.dayLabel} ${day.shortDate}: ${day.xp} XP${day.goalAchieved ? ', goal achieved' : ''}`}
                onClick={() => {
                  triggerSelectionHaptic();
                  setSelectedDateKey(day.dateKey);
                }}
                className="flex flex-col items-center h-full justify-end group cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C] rounded-lg"
              >
                {/* Bar */}
                <div
                  className={`w-full max-w-[48px] bg-slate-100 rounded-t-lg relative flex flex-col justify-end overflow-hidden h-[126px] border transition-colors ${
                    isSelected
                      ? 'border-slate-900 ring-1 ring-slate-900/15'
                      : 'border-slate-200/70 group-hover:border-slate-300'
                  }`}
                >
                  <div
                    className={`w-full transition-all duration-300 rounded-t-lg ${
                      day.goalAchieved
                        ? 'bg-gradient-to-t from-amber-600 to-amber-500'
                        : day.xp > 0
                        ? 'bg-slate-700'
                        : 'bg-transparent'
                    }`}
                    style={{ height: `${Math.max(day.xp > 0 ? 6 : 0, heightPct)}%` }}
                  />

                  {day.goalAchieved && (
                    <div className="absolute top-1 left-0 right-0 flex justify-center text-white">
                      <CheckCircle2 className="w-3.5 h-3.5 drop-shadow-xs" aria-hidden="true" />
                    </div>
                  )}
                </div>

                {/* Day Label & XP */}
                <div className="mt-2.5 text-center">
                  <p
                    className={`text-xs font-semibold ${
                      isToday ? 'text-[#C2410C]' : isSelected ? 'text-slate-900' : 'text-slate-700'
                    }`}
                  >
                    {day.dayLabel}
                  </p>
                  <p className="mt-0.5 text-[11px] font-mono tabular-nums font-bold text-slate-700">
                    {day.xp}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer Legend */}
      <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-500 border border-amber-600 shrink-0" />
            <span>Goal Hit (&ge;{DAILY_XP_GOAL} XP)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-slate-700 shrink-0" />
            <span>Study Activity</span>
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-mono">
          <Flame className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
          <span>Consistency builds exam readiness</span>
        </div>
      </div>
    </section>
  );
}
