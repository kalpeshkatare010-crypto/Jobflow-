import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Whole-app boundary (no app shell around it). */
  fullPage?: boolean;
}

interface State {
  error: Error | null;
  copied: boolean;
}

/**
 * Catches a crash in one screen so the rest of the app keeps working.
 * Saved work is not affected: it lives in the device database, not in the screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept in the browser console for support; nothing is sent anywhere.
    console.error('JobFlow screen error', error, info.componentStack);
  }

  private details(): string {
    const e = this.state.error;
    return [`JobFlow ${__APP_VERSION__}`, `Screen: ${window.location.pathname}`, `Error: ${e?.name}: ${e?.message}`, `Time: ${new Date().toISOString()}`].join('\n');
  }

  private copy = async () => {
    try {
      await navigator.clipboard.writeText(this.details());
      this.setState({ copied: true });
    } catch {
      this.setState({ copied: false });
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    const button =
      'press inline-flex h-10 items-center justify-center rounded-[var(--radius-control)] px-4 text-sm font-medium';
    return (
      <div role="alert" className={this.props.fullPage ? 'grid min-h-dvh place-items-center p-6' : 'py-10'}>
        <div className="mx-auto max-w-[420px] rounded-[var(--radius-card)] bg-surface p-6 text-center">
          <h2 className="text-[17px] font-semibold text-ink-900">This screen ran into a problem</h2>
          <p className="mt-2 text-sm text-ink-700">
            Your saved work is safe on this device. Try again, or reload the app. If it keeps happening, copy the details for
            support (Help &amp; Support).
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" className={`${button} bg-ink-900 text-on-ink`} onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <button type="button" className={`${button} border border-line-strong bg-surface text-ink-900`} onClick={() => window.location.reload()}>
              Reload app
            </button>
            <button type="button" className={`${button} border border-line-strong bg-surface text-ink-900`} onClick={() => void this.copy()}>
              {this.state.copied ? 'Copied' : 'Copy details'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
