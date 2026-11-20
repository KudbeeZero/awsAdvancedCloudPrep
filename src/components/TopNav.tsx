import { BookOpen, CheckSquare, Compass, Layers, WalletCards } from 'lucide-react';
import { NavSection } from '../data/types';
import { triggerSelectionHaptic } from '../utils/haptics';

interface TopNavProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  onStartMockExam: () => void;
}

const NAV_ITEMS: {
  id: NavSection;
  label: string;
  mobileLabel: string;
  icon: typeof Compass;
}[] = [
  { id: 'overview', label: 'Overview', mobileLabel: 'Overview', icon: Compass },
  { id: 'services', label: 'Service Guide', mobileLabel: 'Services', icon: BookOpen },
  { id: 'practice', label: 'Practice Labs', mobileLabel: 'Labs', icon: Layers },
  { id: 'quizzes', label: 'Quizzes', mobileLabel: 'Quizzes', icon: CheckSquare },
  { id: 'flashcards', label: 'Flashcards', mobileLabel: 'Cards', icon: WalletCards },
];

export function TopNav({ activeSection, onNavigate, onStartMockExam }: TopNavProps) {
  const handleSelectNav = (section: NavSection) => {
    if (section !== activeSection) {
      triggerSelectionHaptic();
    }
    onNavigate(section);
  };

  return (
    <>
      {/* Top Bar: Static compact 52px on mobile so sticky cap stays <= 15%; Sticky 64px 3-zone header on md+ desktop */}
      <header className="relative md:sticky md:top-0 z-40 bg-[#F8FAFC]/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 md:h-16 flex items-center justify-between gap-4 md:gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => handleSelectNav('overview')}
            className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 min-h-[44px] flex items-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C2410C] cursor-pointer"
          >
            CloudPrep CLF-C02
          </button>

          {/* Zone 2: Desktop single-line text nav links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectNav(item.id)}
                  className={`py-1.5 border-b-2 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C2410C] ${
                    isActive
                      ? 'border-[#C2410C] text-slate-900 font-semibold'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single primary CTA */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerSelectionHaptic();
                onStartMockExam();
              }}
              className="px-3.5 sm:px-4 min-h-[40px] md:min-h-[38px] text-xs sm:text-sm font-semibold text-white bg-[#C2410C] hover:bg-[#9A3412] active:scale-[0.98] rounded-lg transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C]"
            >
              Start Mock Exam
            </button>
          </div>
        </div>
      </header>

      {/* Fixed Bottom Thumb Tab Bar for vertical iPhone usage (< md) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
      >
        <div className="grid grid-cols-5 items-center h-16 px-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleSelectNav(item.id)}
                className={`relative min-h-[48px] flex flex-col items-center justify-center rounded-lg transition-transform active:scale-95 cursor-pointer ${
                  isActive ? 'text-[#C2410C]' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0.5 w-6 h-0.5 rounded-full bg-[#C2410C]"
                  />
                )}
                <Icon
                  className="w-5 h-5"
                  strokeWidth={isActive ? 2.4 : 1.8}
                  aria-hidden="true"
                />
                <span
                  className={`text-[10px] tracking-tight mt-1 whitespace-nowrap ${
                    isActive ? 'font-bold' : 'font-medium'
                  }`}
                >
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
