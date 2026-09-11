import { Component, Suspense, type ReactNode } from 'react';
import { Typography } from '@material-ui/core';

/**
 * Invokes a guest `render()` callback in a child component so a synchronous
 * throw is caught by the error boundary. Calling `render()` in the parent
 * (even as a child of ErrorBoundary) runs during the parent's render and
 * bypasses the boundary.
 */
const GuestRenderBody = ({ render }: { render: () => ReactNode }) => (
  <>{render()}</>
);

class GuestExtensionErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(): void {
    // Intentionally no error details — guest payloads can include repository identity.
  }

  render() {
    if (this.state.hasError) {
      return (
        <Typography color="error" variant="body2">
          This extension failed to load.
        </Typography>
      );
    }
    return this.props.children;
  }
}

/** Isolates a guest extension render from the host Git Repositories UI. */
export const GuestExtensionRender = ({
  render,
  fallback = null,
}: {
  render: () => ReactNode;
  fallback?: ReactNode;
}) => (
  <GuestExtensionErrorBoundary>
    <Suspense fallback={fallback}>
      <GuestRenderBody render={render} />
    </Suspense>
  </GuestExtensionErrorBoundary>
);
