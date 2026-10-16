import type { NavContentNavItem } from '@backstage/plugin-app-react';
import { resolveNavigationItems } from './navigationItems';

const item = (href: string, id = `page:${href}`, title = href) =>
  ({ href, title, node: { spec: { id } } }) as NavContentNavItem;

describe('configured navigation', () => {
  const rbac = item('/rbac', 'page:rbac', 'RBAC');
  const settings = item('/settings', 'page:user-settings', 'Settings');
  it('supports generic direct links with title overrides and host order', () => {
    expect(
      resolveNavigationItems(
        [settings, rbac],
        [
          {
            id: 'admin',
            page: 'page:rbac',
            title: 'Administration',
            placement: 'bottom',
          },
          { id: 'settings', path: '/settings' },
        ],
      ),
    ).toEqual([
      { id: 'admin', title: 'Administration', placement: 'bottom', item: rbac },
      {
        id: 'settings',
        title: 'Settings',
        placement: 'primary',
        item: settings,
      },
    ]);
  });
  it('supports any group and omits unavailable children', () => {
    expect(
      resolveNavigationItems(
        [rbac],
        [
          {
            id: 'admin',
            title: 'Administration',
            children: [
              { id: 'rbac', path: '/rbac' },
              { id: 'settings', path: '/settings' },
            ],
          },
        ],
      ),
    ).toEqual([
      {
        id: 'admin',
        title: 'Administration',
        placement: 'primary',
        children: [{ id: 'rbac', title: 'RBAC', item: rbac }],
      },
    ]);
  });
  it('omits empty groups and never invents disabled plugin routes', () => {
    expect(
      resolveNavigationItems(
        [],
        [
          {
            id: 'admin',
            title: 'Administration',
            children: [{ id: 'rbac', path: '/rbac' }],
          },
          { id: 'settings', path: '/settings' },
        ],
      ),
    ).toEqual([]);
  });
  it('rejects duplicate IDs, duplicate pages, and ambiguous selectors', () => {
    expect(() =>
      resolveNavigationItems(
        [rbac],
        [
          { id: 'one', path: '/rbac' },
          { id: 'one', path: '/settings' },
        ],
      ),
    ).toThrow('Duplicate or empty');
    expect(() =>
      resolveNavigationItems(
        [rbac],
        [
          { id: 'one', path: '/rbac' },
          { id: 'two', page: 'page:rbac' },
        ],
      ),
    ).toThrow('Duplicate Portal navigation page');
    expect(() =>
      resolveNavigationItems(
        [rbac],
        [{ id: 'one', path: '/rbac', page: 'page:rbac' }],
      ),
    ).toThrow('exactly one');
  });
});
