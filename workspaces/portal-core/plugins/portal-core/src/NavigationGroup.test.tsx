import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ResolvedNavigationItem } from './navigationItems';
import { NavigationGroup } from './NavigationGroup';

jest.mock('@backstage/core-components', () => ({
  useSidebarOpenState: () => ({ isOpen: true }),
  SidebarItem: ({ text, to }: { text: string; to: string }) => (
    <a href={to}>{text}</a>
  ),
}));

const entry = {
  id: 'administration',
  title: 'Administration',
  placement: 'bottom',
  children: [
    { id: 'rbac', title: 'RBAC', item: { href: '/rbac', icon: <span /> } },
  ],
} as Extract<ResolvedNavigationItem, { children: unknown }>;

describe('expandable navigation group', () => {
  it('expands and collapses without navigating the group button', async () => {
    render(<NavigationGroup entry={entry} />);
    const button = screen.getByRole('button', { name: 'Administration' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('link', { name: 'RBAC' })).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(
      screen.getByRole('link', { name: 'RBAC' }).getAttribute('href'),
    ).toBe('/rbac');
    expect(
      document.getElementById(button.getAttribute('aria-controls')!),
    ).not.toBeNull();
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'RBAC' })).toBeNull(),
    );
  });
  it('starts expanded when a child is active', () => {
    render(<NavigationGroup entry={entry} activePath="/rbac" />);
    expect(
      screen
        .getByRole('button', { name: 'Administration' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
  });
});
