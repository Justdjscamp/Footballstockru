import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      let errorDetails = null;
      try {
        if (this.state.error?.message) {
          errorDetails = JSON.parse(this.state.error.message);
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen bg-[#050a05] text-white flex items-center justify-center p-4 font-sans">
          <div className="max-w-md w-full bg-[#0a140a] border border-[#1a2e1a] rounded-3xl p-8 shadow-2xl text-center">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            
            <h1 className="text-2xl font-black mb-2 tracking-tight">УПС! ЧТО-ТО ПОШЛО НЕ ТАК</h1>
            <p className="text-gray-400 mb-8 text-sm leading-relaxed">
              Произошла непредвиденная ошибка. Мы уже работаем над её исправлением.
            </p>

            {errorDetails && (
              <div className="bg-black/40 rounded-2xl p-4 mb-8 text-left border border-white/5">
                <p className="text-[10px] uppercase font-bold text-red-400 mb-2 tracking-widest">Детали ошибки</p>
                <div className="space-y-1">
                  <p className="text-xs text-gray-300 font-mono break-all">
                    <span className="text-gray-500">Path:</span> {errorDetails.path || 'Unknown'}
                  </p>
                  <p className="text-xs text-gray-300 font-mono">
                    <span className="text-gray-500">Op:</span> {errorDetails.operationType}
                  </p>
                  <p className="text-xs text-gray-400 font-mono mt-2 italic">
                    {errorDetails.error}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => window.location.reload()}
                className="flex items-center justify-center gap-2 bg-[#1a2e1a] hover:bg-[#2a3e2a] text-white font-bold py-4 px-6 rounded-2xl transition-all active:scale-95"
              >
                <RefreshCw className="w-5 h-5" />
                <span>Повторить</span>
              </button>
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg shadow-green-900/20 active:scale-95"
              >
                <Home className="w-5 h-5" />
                <span>На главную</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
