import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Lock, Sparkles, Trophy } from 'lucide-react';
import { NavSection, StudyProgress } from '../data/types';
import {
  AchievementBadge,
  AchievementCategory,
  AchievementTier,
  getAchievements,
} from '../utils/arcade';

interface AchievementsDisplayProps {
  progress: StudyProgress;
  onClaimReward?: (achievementId: string, xpReward: number, title: string) => void;
  onClaimAllRewards?: (items: { id: string; xpReward: number; title: string }[]) => void;
  onNavigateAction?: (section: NavSection) => void;
  compact?: boolean;
  darkSurface?: boolean;
}

const TIER_STYLES: Record<
  AchievementTier,
  {
    label: string;
    cardLight: string;
    cardDark: string;
    emblemBg: string;
    stroke: string;
    fill: string;
    accentText: string;
  }
> = {
  bronze: {
    label: 'Bronze',
    cardLight: 'bg-amber-50/60 border-amber-200',
    cardDark: 'bg-amber-950/30 border-amber-500/40',
    emblemBg: 'bg-amber-100 border-amber-300',
    stroke: '#B45309',
    fill: '#FDE68A',
    accentText: 'text-amber-800',
  },
  silver: {
    label: 'Silver',
    cardLight: 'bg-slate-50 border-slate-300',
    cardDark: 'bg-slate-800/90 border-slate-500/50',
    emblemBg: 'bg-slate-100 border-slate-300',
    stroke: '#334155',
    fill: '#E2E8F0',
    accentText: 'text-slate-700',
  },
  gold: {
    label: 'Gold',
    cardLight: 'bg-amber-50 border-amber-300',
    cardDark: 'bg-amber-900/30 border-amber-400/60',
    emblemBg: 'bg-amber-100 border-amber-400',
    stroke: '#C2410C',
    fill: '#FCD34D',
    accentText: 'text-[#C2410C]',
  },
  platinum: {
    label: 'Platinum',
    cardLight: 'bg-emerald-50/70 border-emerald-300',
    cardDark: 'bg-emerald-950/35 border-emerald-400/50',
    emblemBg: 'bg-emerald-100 border-emerald-300',
    stroke: '#047857',
    fill: '#A7F3D0',
    accentText: 'text-emerald-800',
  },
};

function BadgeEmblem({
  badge,
  darkSurface,
}: {
  badge: AchievementBadge;
  darkSurface?: boolean;
}) {
  const tier = TIER_STYLES[badge.tier];
  const stroke = badge.unlocked ? tier.stroke : darkSurface ? '#64748B' : '#94A3B8';
  const fill = badge.unlocked ? tier.fill : 'none';

  return (
    <div
      className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-transform duration-150 ${
        badge.unlocked
          ? tier.emblemBg
          : darkSurface
          ? 'bg-slate-800 border-slate-700'
          : 'bg-slate-100 border-slate-200'
      }`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none">
        {badge.id === 'first-blitz' && (
          <>
            <polygon
              points="16,3 27,9 27,23 16,29 5,23 5,9"
              fill={fill}
              stroke={stroke}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <polygon
              points="17,8 11,17 16,17 15,24 21,15 16,15"
              fill={badge.unlocked ? stroke : 'none'}
              stroke={stroke}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </>
        )}

        {badge.id === 'ten-combo' && (
          <>
            <path
              d="M16 3L26 7.5V16C26 22.2 21.7 26.8 16 29C10.3 26.8 6 22.2 6 16V7.5L16 3Z"
              fill={fill}
              stroke={stroke}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M16 9C18.5 12 20 14.2 20 16.8C20 19.3 18.2 21.2 16 21.2C13.8 21.2 12 19.3 12 16.8C12 15.1 12.8 13.7 13.8 12.5C14 14 14.8 14.7 15.6 15C15.2 12.8 15.4 10.9 16 9Z"
              fill={badge.unlocked ? stroke : 'none'}
              stroke={stroke}
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </>
        )}

        {badge.id === 'perfect-lab' && (
          <>
            <circle
              cx="16"
              cy="16"
              r="11.5"
              fill={fill}
              stroke={stroke}
              strokeWidth="2"
            />
            <path
              d="M16 7L20.5 23L16 19.5L11.5 23L16 7Z"
              fill={badge.unlocked ? stroke : 'none'}
              stroke={stroke}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </>
        )}

        {badge.id === 'lab-architect' && (
          <>
            <rect
              x="5"
              y="5"
              width="22"
              height="22"
              rx="4"
              fill={fill}
              stroke={stroke}
              strokeWidth="2"
            />
            <path
              d="M10 20L16 10L22 20H10Z"
              fill={badge.unlocked ? stroke : 'none'}
              stroke={stroke}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </>
        )}

        {badge.id === 'daily-goal' && (
          <>
            <circle
              cx="16"
              cy="16"
              r="11.5"
              fill={fill}
              stroke={stroke}
              strokeWidth="2"
            />
            <circle cx="16" cy="16" r="5" stroke={stroke} strokeWidth="2" />
            <circle cx="16" cy="16" r="2" fill={stroke} />
          </>
        )}

        {badge.id === 'streak-3' && (
          <>
            <path
              d="M16 3L19.5 9.5L26.8 10.7L21.7 16L22.7 23.2L16 20L9.3 23.2L10.3 16L5.2 10.7L12.5 9.5L16 3Z"
              fill={fill}
              stroke={stroke}
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </>
        )}

        {badge.id === 'memory-vault' && (
          <>
            <rect
              x="6"
              y="13"
              width="20"
              height="14"
              rx="3"
              fill={fill}
              stroke={stroke}
              strokeWidth="2"
            />
            <path
              d="M11 13V10C11 7.2 13.2 5 16 5C18.8 5 21 7.2 21 10V13"
              stroke={stroke}
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="16" cy="20" r="2.2" fill={stroke} />
          </>
        )}

        {badge.id === 'exam-ready' && (
          <>
            <path
              d="M7 22L5 9L11.5 14L16 6L20.5 14L27 9L25 22H7Z"
              fill={fill}
              stroke={stroke}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <rect x="7" y="24" width="18" height="3" rx="1.5" fill={stroke} />
          </>
        )}
      </svg>
    </div>
  );
}

const CATEGORY_OPTIONS: { id: 'all' | AchievementCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'arcade', label: 'Arcade' },
  { id: 'labs', label: 'Labs' },
  { id: 'mastery', label: 'Mastery' },
  { id: 'consistency', label: 'Streak' },
];

export function AchievementsDisplay({
  progress,
  onClaimReward,
  onClaimAllRewards,
  onNavigateAction,
  compact = false,
  darkSurface = false,
}: AchievementsDisplayProps) {
  const [categoryFilter, setCategoryFilter] = useState<'all' | AchievementCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unlocked' | 'claimable'>('all');

  const badges = useMemo(() => getAchievements(progress), [progress]);
  const unlockedCount = badges.filter((b) => b.unlocked).length;
  const claimableBadges = badges.filter((b) => b.unlocked && !b.claimed);
  const claimableTotalXp = claimableBadges.reduce((sum, b) => sum + b.xpReward, 0);
  const earnedRewardXp = badges
    .filter((b) => b.claimed)
    .reduce((sum, b) => sum + b.xpReward, 0);

  const visibleBadges = useMemo(() => {
    let list = badges;
    if (compact) {
      list = list.filter((b) => b.category === 'arcade' || b.category === 'labs' || b.unlocked);
    } else if (categoryFilter !== 'all') {
      list = list.filter((b) => b.category === categoryFilter);
    }
    if (statusFilter === 'unlocked') {
      list = list.filter((b) => b.unlocked);
    } else if (statusFilter === 'claimable') {
      list = list.filter((b) => b.unlocked && !b.claimed);
    }
    return list;
  }, [badges, categoryFilter, statusFilter, compact]);

  const handleClaimAll = () => {
    if (claimableBadges.length === 0) return;
    if (onClaimAllRewards) {
      onClaimAllRewards(
        claimableBadges.map((b) => ({ id: b.id, xpReward: b.xpReward, title: b.title }))
      );
      return;
    }
    claimableBadges.forEach((b) => onClaimReward?.(b.id, b.xpReward, b.title));
  };

  return (
    <section
      aria-labelledby="achievements-heading"
      className={
        darkSurface
          ? 'bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 text-white space-y-5'
          : 'bg-white border border-slate-200 rounded-xl p-5 sm:p-8 space-y-5'
      }
    >
      {/* Header & Claim All CTA */}
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b ${
          darkSurface ? 'border-slate-800' : 'border-slate-100'
        }`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Trophy
              className={`w-4 h-4 ${darkSurface ? 'text-amber-400' : 'text-[#C2410C]'}`}
              aria-hidden="true"
            />
            <h2
              id="achievements-heading"
              className={`font-display text-lg font-bold ${
                darkSurface ? 'text-white' : 'text-slate-900'
              }`}
            >
              Achievements &amp; Milestone Badges
            </h2>
          </div>
          <p
            className={`text-xs font-mono tabular-nums ${
              darkSurface ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            {unlockedCount}/{badges.length} badges unlocked · {earnedRewardXp} bonus XP claimed
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {claimableBadges.length > 0 && onClaimReward && (
            <button
              type="button"
              onClick={handleClaimAll}
              className="inline-flex items-center gap-1.5 px-4 min-h-[42px] text-xs font-bold text-white bg-[#C2410C] hover:bg-[#9A3412] active:scale-[0.98] rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              Claim {claimableBadges.length > 1 ? `All (+${claimableTotalXp} XP)` : `+${claimableTotalXp} XP`}
            </button>
          )}
        </div>
      </div>

      {/* Category & Status Filters (Full Display Mode) */}
      {!compact && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Filter achievements by category"
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto no-scrollbar"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={categoryFilter === opt.id}
                onClick={() => setCategoryFilter(opt.id)}
                className={`px-3 min-h-[36px] text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  categoryFilter === opt.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'unlocked', label: `Unlocked (${unlockedCount})` },
                { id: 'claimable', label: `Claim (${claimableBadges.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 min-h-[36px] text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Achievement Grid */}
      {visibleBadges.length === 0 ? (
        <div
          className={`rounded-xl border p-6 text-center text-sm ${
            darkSurface
              ? 'border-slate-800 bg-slate-800/40 text-slate-300'
              : 'border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          No badges match this filter yet. Complete Cloud Blitz runs, solve labs, or build a
          streak to unlock milestones.
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 ${
            compact ? '' : 'lg:grid-cols-4'
          } gap-3.5`}
        >
          {visibleBadges.map((badge) => {
            const tier = TIER_STYLES[badge.tier];
            const pct = Math.min(
              100,
              Math.round((badge.progressCurrent / Math.max(badge.progressTarget, 1)) * 100)
            );
            const isClaimable = badge.unlocked && !badge.claimed;

            const cardClass = badge.unlocked
              ? darkSurface
                ? tier.cardDark
                : tier.cardLight
              : darkSurface
              ? 'bg-slate-800/50 border-slate-800 text-slate-300'
              : 'bg-slate-50/70 border-slate-200 text-slate-600';

            return (
              <div
                key={badge.id}
                className={`rounded-xl border p-4 flex flex-col justify-between gap-3.5 transition-all duration-150 ${cardClass}`}
              >
                <div className="flex items-start gap-3">
                  <BadgeEmblem badge={badge} darkSurface={darkSurface} />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[11px] font-mono tabular-nums ${
                        badge.unlocked
                          ? darkSurface
                            ? 'text-amber-300'
                            : tier.accentText
                          : darkSurface
                          ? 'text-slate-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {tier.label} · +{badge.xpReward} XP
                    </p>
                    <h3
                      className={`mt-0.5 font-display text-sm font-bold leading-snug ${
                        darkSurface ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      {badge.title}
                    </h3>
                  </div>
                </div>

                <p
                  className={`text-xs leading-relaxed ${
                    darkSurface ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  {badge.detail}
                </p>

                <div className="space-y-2.5 pt-1">
                  <div className="space-y-1">
                    <div
                      className={`flex items-center justify-between text-[11px] font-mono tabular-nums ${
                        darkSurface ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      <span>{badge.unlocked ? 'Completed' : badge.progressText}</span>
                      <span>{pct}%</span>
                    </div>
                    <div
                      className={`w-full h-1.5 rounded-full overflow-hidden ${
                        darkSurface ? 'bg-slate-800' : 'bg-slate-200/80'
                      }`}
                    >
                      <div
                        className={`h-full transition-all duration-300 ${
                          badge.unlocked
                            ? 'bg-emerald-600'
                            : darkSurface
                            ? 'bg-amber-400'
                            : 'bg-[#C2410C]'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {isClaimable && onClaimReward ? (
                    <button
                      type="button"
                      onClick={() => onClaimReward(badge.id, badge.xpReward, badge.title)}
                      className="w-full min-h-[40px] px-3 text-xs font-bold text-white bg-[#C2410C] hover:bg-[#9A3412] active:scale-[0.98] rounded-lg transition-all cursor-pointer"
                    >
                      Claim +{badge.xpReward} XP
                    </button>
                  ) : badge.unlocked ? (
                    <div
                      className={`flex items-center justify-between text-xs font-semibold min-h-[32px] ${
                        darkSurface ? 'text-emerald-300' : 'text-emerald-700'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        {badge.claimed ? 'Reward Claimed' : 'Unlocked'}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums">
                        +{badge.xpReward} XP
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs min-h-[32px]">
                      <span
                        className={`inline-flex items-center gap-1 ${
                          darkSurface ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        <Lock className="w-3 h-3 shrink-0" aria-hidden="true" />
                        Locked
                      </span>
                      {onNavigateAction && (
                        <button
                          type="button"
                          onClick={() => onNavigateAction(badge.targetSection)}
                          className={`inline-flex items-center gap-1 font-semibold cursor-pointer hover:underline ${
                            darkSurface ? 'text-amber-300' : 'text-[#C2410C]'
                          }`}
                        >
                          {badge.actionLabel}
                          <ArrowRight className="w-3 h-3" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
