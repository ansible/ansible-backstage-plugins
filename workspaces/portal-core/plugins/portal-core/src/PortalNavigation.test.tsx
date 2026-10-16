import type { NavContentNavItem } from '@backstage/plugin-app-react';
import {
  selectNavigationItems,
  partitionNavigationItems,
} from './PortalNavigation';

const item = (href: string) => ({ href }) as NavContentNavItem;
describe('Portal navigation selection', () => {
  it('preserves discovery when the opt-in filter is absent', () => {
    const items = [item('/catalog'), item('/self-service')];
    expect(selectNavigationItems(items)).toBe(items);
  });
  it('shows only exact allowed routes in host-configured order', () => {
    const templates = item('/self-service');
    const repos = item('/self-service/repositories');
    expect(
      selectNavigationItems(
        [templates, item('/catalog'), repos],
        [repos.href, templates.href],
      ),
    ).toEqual([repos, templates]);
  });
  it('does not invent missing or permission-filtered navigation entries', () => {
    expect(selectNavigationItems([item('/settings')], ['/rbac'])).toEqual([]);
    expect(selectNavigationItems([item('/settings')], [])).toEqual([]);
  });
  it('keeps the requested primary order and Administration above Settings at the bottom', () => {
    const paths = [
      '/self-service',
      '/self-service/create/tasks',
      '/self-service/ee',
      '/self-service/collections',
      '/self-service/repositories',
      '/rbac',
      '/settings',
    ];
    const items = paths.map(item);
    expect(partitionNavigationItems(items, ['/rbac', '/settings'])).toEqual({
      primary: items.slice(0, 5),
      bottom: items.slice(5),
    });
    expect(partitionNavigationItems(items, ['/missing']).primary).toEqual(
      items,
    );
  });
});
