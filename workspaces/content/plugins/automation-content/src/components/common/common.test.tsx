import { fireEvent, render, screen } from '@testing-library/react';
import { EmptyState, PageHeaderSection } from './index';
import { BreadcrumbsNavigation } from './BreadcrumbsNavigation';

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

it('keeps source configuration and repository-empty guidance distinct', () => {
  const { rerender } = render(
    <EmptyState hasConfiguredSources={false} canSync onSyncClick={jest.fn()} />,
  );
  expect(screen.getByText('No content sources configured')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Sync Now' })).toBeNull();
  rerender(
    <EmptyState repositoryFilter="example" canSync onSyncClick={jest.fn()} />,
  );
  expect(
    screen.getByText('No collections discovered from this repository'),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Sync Now' })).toBeNull();
});

it('does not expose sync without caller authorization', () => {
  const { rerender } = render(<EmptyState onSyncClick={jest.fn()} />);
  expect(screen.queryByRole('button', { name: 'Sync Now' })).toBeNull();
  rerender(
    <EmptyState
      canSync
      onSyncClick={jest.fn()}
      syncDisabled
      syncDisabledReason="Checking permissions..."
    />,
  );
  expect(
    screen.getByRole('button', { name: 'Sync Now' }).hasAttribute('disabled'),
  ).toBe(true);
  expect(screen.getByText('Checking permissions...')).toBeTruthy();
});

it('preserves extra description and visible sync feedback in the header', () => {
  render(
    <PageHeaderSection
      title="Collections"
      description="Browse content."
      descriptionExtra={<span>Additional guidance</span>}
      onSyncClick={jest.fn()}
      syncInProgress
    />,
  );
  expect(screen.getByText('Additional guidance')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe('Sync in progress');
});

it('renders real breadcrumb destinations and a non-link current item', () => {
  render(
    <BreadcrumbsNavigation
      items={[
        { label: 'Catalog', href: '/catalog' },
        { label: 'Current', href: '/current' },
      ]}
    />,
  );
  expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'Catalog' }).getAttribute('href'),
  ).toBe('/catalog');
  expect(screen.queryByRole('link', { name: 'Current' })).toBeNull();
  expect(screen.getByText('Current').getAttribute('aria-current')).toBe('page');
});

it('supports callback ancestors without placeholder hash navigation', () => {
  const navigate = jest.fn();
  render(
    <BreadcrumbsNavigation
      items={[{ label: 'Catalog', onClick: navigate }, { label: 'Current' }]}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Catalog' }));
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('link')).toBeNull();
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
