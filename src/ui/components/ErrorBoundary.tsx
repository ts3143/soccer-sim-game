/**
 * A page that crashes while drawing shows a plain message instead of a blank screen. The
 * rest of the app (top bar, sidebar) keeps working; moving to another page clears it.
 */
import { Component, type ReactNode } from "react";

interface Props {
  /** Changes when the page changes: the message clears. */
  resetKey: string;
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="alert alert-danger" data-testid="page-crashed">
        <p className="mb-2">
          This page hit a problem and couldn&apos;t be shown ({error.message}). Your game is saved
          up to the last thing you did.
        </p>
        <button type="button" className="btn btn-sm btn-light" onClick={() => location.reload()}>
          Reload the page
        </button>
      </div>
    );
  }
}
