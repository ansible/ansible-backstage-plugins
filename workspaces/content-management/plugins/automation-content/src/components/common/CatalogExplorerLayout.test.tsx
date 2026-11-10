import { fireEvent, render, screen } from '@testing-library/react';
import { CatalogExplorerLayout } from './CatalogExplorerLayout';

function renderExplorer(onSearchChange = jest.fn()): ReturnType<typeof render> {
  return render(
    <CatalogExplorerLayout
      filters={<span>Repository filter</span>}
      search="Search images"
      searchValue="ansible"
      onSearchChange={onSearchChange}
    >
      <span>Catalog results</span>
    </CatalogExplorerLayout>,
  );
}

it('renders caller filters and results', () => {
  renderExplorer();
  expect(screen.getByText('Repository filter')).toBeTruthy();
  expect(screen.getByText('Catalog results')).toBeTruthy();
  expect(
    screen.getByRole('complementary', { name: 'Search images filters' }),
  ).toBeTruthy();
});

it('provides a labeled controlled search and forwards changes', () => {
  const onSearchChange = jest.fn();
  renderExplorer(onSearchChange);
  const search = screen.getByRole('searchbox', { name: 'Search images' });
  expect(search.getAttribute('placeholder')).toBe('Search images');
  expect((search as HTMLInputElement).value).toBe('ansible');
  fireEvent.change(search, { target: { value: 'python' } });
  expect(onSearchChange).toHaveBeenCalledWith('python');
});

it('connects the mobile toggle to its panel and toggles expansion', () => {
  renderExplorer();
  const button = screen.getByRole('button', { name: 'Filters' });
  const panel = screen.getByRole('complementary');
  expect(button.getAttribute('aria-controls')).toBe(panel.id);
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(panel.getAttribute('data-open')).toBe('false');

  fireEvent.click(button);
  expect(screen.getByRole('button', { name: 'Hide filters' })).toBe(button);
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(panel.getAttribute('data-open')).toBe('true');

  fireEvent.click(button);
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(panel.getAttribute('data-open')).toBe('false');
});

it('uses distinct filter panel IDs for multiple explorers', () => {
  renderExplorer();
  renderExplorer();
  const buttons = screen.getAllByRole('button', { name: 'Filters' });
  const panels = screen.getAllByRole('complementary');
  expect(panels[0].id).not.toBe(panels[1].id);
  buttons.forEach((button, index) => {
    expect(button.getAttribute('aria-controls')).toBe(panels[index].id);
  });
});
