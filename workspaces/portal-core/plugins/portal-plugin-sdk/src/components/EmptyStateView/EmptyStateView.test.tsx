import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { EmptyStateView } from '../../..';

it('renders a heading without Backstage APIs, configuration, or default actions', () => {
  render(<EmptyStateView title="No conversions yet" />);
  expect(
    screen.getByRole('heading', { level: 2, name: 'No conversions yet' }),
  ).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(
    screen.queryByText(/collection|sync|administrator/i),
  ).not.toBeInTheDocument();
});

it('renders consumer-owned content and actions without adding sync behavior', () => {
  const start = jest.fn();
  render(
    <EmptyStateView
      title="No conversions yet"
      description={
        <>
          Convert source content to Ansible. <a href="/guide">Read the guide</a>
        </>
      }
      icon={<svg data-testid="conversion-icon" />}
      actions={
        <>
          <button onClick={start}>Start conversion</button>
          <button>More actions</button>
        </>
      }
    />,
  );
  expect(screen.getByText(/Convert source content/)).toBeVisible();
  expect(screen.getByRole('link', { name: 'Read the guide' })).toHaveAttribute(
    'href',
    '/guide',
  );
  expect(screen.getByTestId('conversion-icon').parentElement).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(screen.getByRole('button', { name: 'More actions' })).toBeVisible();
  expect(start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Start conversion' }));
  expect(start).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole('button', { name: 'Sync Now' }),
  ).not.toBeInTheDocument();
});
