import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NotificationCard } from './NotificationCard';
import type { Notification } from './types';

describe('NotificationCard', () => {
  const onClose = jest.fn();
  const notification = (
    overrides: Partial<Notification> = {},
  ): Notification => ({
    id: 'notice',
    title: 'Sync complete',
    severity: 'info',
    timestamp: new Date(0),
    ...overrides,
  });
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it.each(['info', 'success', 'warning', 'error'] as const)(
    'renders %s and closes only the selected notification',
    severity => {
      render(
        <NotificationCard
          notification={notification({ severity })}
          onClose={onClose}
        />,
      );
      expect(screen.getByText('Sync complete')).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'Close notification' }),
      );
      expect(onClose).toHaveBeenCalledWith('notice');
    },
  );

  it.each([undefined, null, '', '  '])(
    'omits a non-renderable description (%s)',
    description => {
      render(
        <NotificationCard
          notification={notification({ description })}
          onClose={onClose}
        />,
      );
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Collapse' }),
      ).not.toBeInTheDocument();
    },
  );

  it('renders text and rich descriptions without requiring an item list', () => {
    const { rerender } = render(
      <NotificationCard
        notification={notification({ description: 'Two sources updated' })}
        onClose={onClose}
      />,
    );
    expect(screen.getByText('Two sources updated')).toBeInTheDocument();
    rerender(
      <NotificationCard
        notification={notification({
          description: <a href="/history">View history</a>,
        })}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole('link', { name: 'View history' })).toHaveAttribute(
      'href',
      '/history',
    );
  });

  it('toggles a collapsible list and completes its entrance animation', () => {
    const { container, rerender } = render(
      <NotificationCard
        notification={notification({
          collapsible: true,
          items: ['Repository one', 'Repository two'],
        })}
        onClose={onClose}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    act(() => jest.advanceTimersByTime(500));
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    act(() => jest.advanceTimersByTime(500));
    expect(screen.getByText('Repository two')).toBeVisible();
    rerender(
      <NotificationCard
        notification={notification({ isExiting: true })}
        onClose={onClose}
      />,
    );
    expect((container.firstChild as HTMLElement).className).toContain(
      'cardExiting',
    );
  });

  it.each([{ items: [] }, { items: undefined }])(
    'does not expand an empty item list ($items)',
    ({ items }) => {
      const { unmount } = render(
        <NotificationCard
          notification={notification({ collapsible: true, items })}
          onClose={onClose}
        />,
      );
      expect(
        screen.queryByRole('button', { name: 'Collapse' }),
      ).not.toBeInTheDocument();
      unmount();
      expect(jest.getTimerCount()).toBe(0);
    },
  );
});
