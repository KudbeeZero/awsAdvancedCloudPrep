import { useEffect, useState } from 'react';
import { Download, PlusSquare, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    if (!showIOSGuide) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowIOSGuide(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showIOSGuide]);

  if (isInstalled) return null;
  if (!isInstallable && !isIOS) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isInstallable) {
            void install();
          } else {
            setShowIOSGuide(true);
          }
        }}
        className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        {isIOS ? (
          <>
            <Smartphone className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
            Add to iPhone
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
            Install App
          </>
        )}
      </button>

      {showIOSGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-install-title"
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-mono font-semibold text-[#C2410C]">
                  iPhone & iPad Home Screen
                </p>
                <h3
                  id="ios-install-title"
                  className="mt-1 font-display text-lg font-bold text-slate-900"
                >
                  Install CloudPrep CLF-C02
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                aria-label="Close installation guide"
                className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              Run CloudPrep full-screen with offline access to flashcards, practice labs, and
              60-second Cloud Blitz directly from your iOS Home Screen.
            </p>

            <ol className="space-y-3 text-sm text-slate-800">
              <li className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-mono text-xs font-bold w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center shrink-0">
                  1
                </span>
                <div className="flex-1">
                  Tap the <strong className="font-semibold">Share</strong> button{' '}
                  <Share className="inline w-4 h-4 text-[#C2410C] align-text-bottom" aria-hidden="true" />{' '}
                  in Safari&apos;s toolbar.
                </div>
              </li>
              <li className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-mono text-xs font-bold w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center shrink-0">
                  2
                </span>
                <div className="flex-1">
                  Scroll down and tap <strong className="font-semibold">Add to Home Screen</strong>{' '}
                  <PlusSquare className="inline w-4 h-4 text-slate-700 align-text-bottom" aria-hidden="true" />.
                </div>
              </li>
              <li className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-mono text-xs font-bold w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center shrink-0">
                  3
                </span>
                <div className="flex-1">
                  Tap <strong className="font-semibold">Add</strong> in the upper-right corner.
                </div>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full min-h-[44px] text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-slate-900 text-amber-200 border-b border-slate-800 px-4 py-2 text-xs font-medium"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
        <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
        <span>Offline Mode · Quizzes, Flashcards &amp; Cloud Blitz remain active</span>
      </div>
    </div>
  );
}
