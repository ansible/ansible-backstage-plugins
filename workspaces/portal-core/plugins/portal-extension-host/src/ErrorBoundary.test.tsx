/* eslint-disable no-console */
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

// Silence expected console.error output in tests that trigger the boundary.
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

const GoodComponent = () => <div>hello from contribution</div>;

const CrashingComponent = (): never => {
  throw new Error('render kaboom');
};

describe('ErrorBoundary', () => {
  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary contributionId="test-contrib">
        <GoodComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('hello from contribution')).toBeInTheDocument();
  });

  it('renders a fallback message when a child throws during render', () => {
    render(
      <ErrorBoundary contributionId="broken-tab">
        <CrashingComponent />
      </ErrorBoundary>,
    );
    expect(
      screen.getByText(/Extension "broken-tab" failed to render/),
    ).toBeInTheDocument();
  });

  it('does not render children after catching an error', () => {
    render(
      <ErrorBoundary contributionId="broken-tab">
        <CrashingComponent />
      </ErrorBoundary>,
    );
    expect(
      screen.queryByText('hello from contribution'),
    ).not.toBeInTheDocument();
  });

  it('logs the contributionId and error to console.error', () => {
    render(
      <ErrorBoundary contributionId="noisy-plugin">
        <CrashingComponent />
      </ErrorBoundary>,
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('"noisy-plugin"'),
      expect.any(Error),
      expect.anything(),
    );
  });
});
