import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary caught an error]:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetCache = () => {
    try {
      localStorage.removeItem("socialdesk_active_tab");
      localStorage.removeItem("socialdesk_analytics_subtab");
    } catch {}
    window.location.href = "/";
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--bg,#f8fafc)] text-[var(--text,#0f172a)] flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-xl dark:border-red-900/50 dark:bg-slate-900">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 dark:bg-red-950/60">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold">Đã xảy ra sự cố khi tải giao diện</h2>
                <p className="text-xs text-[var(--dim,#64748b)]">
                  Ứng dụng gặp lỗi hiển thị ngoài ý muốn. Bạn có thể thử tải lại trang hoặc đặt lại bộ nhớ tạm.
                </p>
              </div>
            </div>

            {this.state.error && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 font-mono text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300 overflow-x-auto max-h-32">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition"
              >
                Tải lại trang (F5)
              </button>
              <button
                type="button"
                onClick={this.handleResetCache}
                className="rounded-lg border border-[var(--border,#e2e8f0)] bg-[var(--surface,#fff)] px-4 py-2 text-xs font-semibold text-[var(--text,#0f172a)] hover:bg-[var(--surface-alt,#f1f5f9)] active:scale-95 transition"
              >
                Đặt lại tab & Mở lại
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
