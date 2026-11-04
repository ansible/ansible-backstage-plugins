import { fireEvent, render, screen } from '@testing-library/react';
import { CollectionsFilters } from './CollectionsFilters';
import type { CollectionsFiltersProps } from './CollectionsFilters';

const baseProps: CollectionsFiltersProps = {
  search: '',
  onSearchChange: jest.fn(),
  scope: 'all',
  onScopeChange: jest.fn(),
  allCount: 4,
  starredCount: 1,
  starredAvailable: false,
  sourceTypeOptions: [{ id: 'all', label: 'All sources' }],
  sourceTypeFilter: 'all',
  sourceTypeFilterAvailable: false,
  onSourceTypeFilterChange: jest.fn(),
  tags: [],
  tagFilter: 'all',
  onTagFilterChange: jest.fn(),
  tagsAvailable: false,
  latestOnly: true,
  onLatestOnlyChange: jest.fn(),
};

it('keeps the vertical Tina scope and omits diagnostic copy for unavailable facets', () => {
  render(<CollectionsFilters {...baseProps} />);

  expect(screen.getByRole('heading', { name: 'Personal' })).toBeTruthy();
  expect(
    screen.getByRole('button', {
      name: 'Favorites, unavailable for current catalog results',
    }),
  ).toHaveProperty('disabled', true);
  expect(screen.getByRole('heading', { name: 'Company' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'All, 4' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Personal/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Company/ })).toBeNull();
  const scopeGroup = screen.getByRole('group', { name: 'Collection scope' });
  const scopeText = scopeGroup.textContent ?? '';
  expect(scopeText.indexOf('Personal')).toBeLessThan(
    scopeText.indexOf('Company'),
  );
  expect(
    screen.getByRole('checkbox', { name: 'Show latest version only' }),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'All sources Source type' }),
  ).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: 'All tags Tags' })).toHaveProperty(
    'disabled',
    true,
  );
  expect(screen.queryByText(/unavailable from the catalog/i)).toBeNull();
  expect(screen.queryByRole('button', { name: /All registries/ })).toBeNull();
});

it('shows only verified source types and catalog tags when those values exist', () => {
  const onLatestOnlyChange = jest.fn();
  render(
    <CollectionsFilters
      {...baseProps}
      starredAvailable
      sourceTypeOptions={[
        { id: 'all', label: 'All sources' },
        { id: 'external-registry', label: 'External registry' },
        { id: 'unknown', label: 'Unknown' },
      ]}
      sourceTypeFilterAvailable
      tags={['eda', 'rulebooks']}
      tagsAvailable
      onLatestOnlyChange={onLatestOnlyChange}
    />,
  );

  expect(screen.getByText('External registry')).toBeTruthy();
  expect(screen.getByText('Unknown')).toBeTruthy();
  expect(screen.getByText('eda')).toBeTruthy();
  expect(screen.getByText('rulebooks')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'All sources Source type' }),
  ).toHaveProperty('disabled', false);
  expect(screen.getByRole('button', { name: /All tags Tags/ })).toHaveProperty(
    'disabled',
    false,
  );
  expect(screen.getByRole('button', { name: 'Favorites, 1' })).toHaveProperty(
    'disabled',
    false,
  );
  expect(screen.getByRole('heading', { name: 'Personal' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Company' })).toBeTruthy();
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Show latest version only' }),
  );
  expect(onLatestOnlyChange).toHaveBeenCalledWith(false);
});
