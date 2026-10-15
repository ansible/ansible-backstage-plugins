import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Typography } from '@material-ui/core';

interface Props {
  /** The contribution ID, used in the error log message. */
  contributionId: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Per-contribution error boundary. Catches render-time errors thrown by
 * community plugin components and renders a contained error message in
 * place of the broken contribution. The rest of the page continues to work.
 *
 * Usage: wrap each contribution component individually so one broken plugin
 * cannot take down an entire detail page or experience slot.
 */
export class ErrorBoundary extends Component<Props, State> {
  static getDerivedStateFromError(_error: Error): State {
    return { hasError: true };
  }

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(
      `[ExperienceSlot] Contribution "${this.props.contributionId}" threw during render:`,
      error,
      info.componentStack,
    );
  }

  override render() {
    if (this.state.hasError) {
      return (
        <Typography
          variant="caption"
          color="error"
          style={{ display: 'block', padding: '8px 16px' }}
        >
          Extension &quot;{this.props.contributionId}&quot; failed to render.
        </Typography>
      );
    }
    return this.props.children;
  }
}
