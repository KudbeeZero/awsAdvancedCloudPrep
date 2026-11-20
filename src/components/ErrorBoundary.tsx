import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected error occurred.',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application ErrorBoundary caught error:', error, errorInfo);
  }

  private handleRecover = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  public render() {
    if (this.state.hasError) {
      let friendlyDetail = 'Something interrupted your study session. Your local progress remains safe.';
      try {
        const parsed = JSON.parse(this.state.errorMessage) as { operationType?: string };
        if (parsed && parsed.operationType) {
          friendlyDetail =
            'Unable to sync your account right now. Please sign in again or continue studying locally.';
        }
      } catch {
        // Non-JSON error message; keep friendly fallback text
      }

      return (
        <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-[#C2410C] shrink-0">
                <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h1 className="font-display text-lg font-bold text-slate-900">
                  Session Recovery
                </h1>
                <p className="text-xs text-slate-500">CloudPrep CLF-C02</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{friendlyDetail}</p>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleRecover}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 min-h-[44px] text-sm font-semibold text-white bg-[#C2410C] hover:bg-[#9A3412] rounded-xl cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                Try Again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 min-h-[44px] text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
