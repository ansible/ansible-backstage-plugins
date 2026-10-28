import { render, screen } from '@testing-library/react';
import { EmptyState, PageHeaderSection } from './index';

it('distinguishes no matches and preserves a recovery action', () => {
  render(
    <EmptyState
      title="No matches"
      description="Try another search."
      action={<button>Clear filters</button>}
    />,
  );
  expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
    'No matches',
  );
  expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy();
});

it('renders one route heading and visible help and status', () => {
  render(
    <PageHeaderSection
      title="Collections"
      help="Inventory may be partial."
      status="Sync failed"
    />,
  );
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    'Collections',
  );
  expect(screen.getByText('Inventory may be partial.')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe('Sync failed');
});
