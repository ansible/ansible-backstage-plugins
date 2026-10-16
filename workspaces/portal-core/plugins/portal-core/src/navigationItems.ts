import type { NavContentNavItem } from '@backstage/plugin-app-react';

/** A link references a discovered page by extension ID or exact route. */
export interface NavigationLinkConfig {
  id: string;
  page?: string;
  path?: string;
  title?: string;
  placement?: 'primary' | 'bottom';
}

export interface NavigationGroupConfig {
  id: string;
  title: string;
  placement?: 'primary' | 'bottom';
  children: NavigationLinkConfig[];
}

export type NavigationItemConfig = NavigationLinkConfig | NavigationGroupConfig;
export type ResolvedNavigationItem = {
  id: string;
  title: string;
  placement: 'primary' | 'bottom';
} & (
  | { item: NavContentNavItem }
  | { children: Array<{ id: string; title: string; item: NavContentNavItem }> }
);

/** Never synthesize a route for a missing or disabled plugin. */
export function resolveNavigationItems(
  items: NavContentNavItem[],
  configured: NavigationItemConfig[],
): ResolvedNavigationItem[] {
  const ids = new Set<string>();
  const pages = new Set<string>();
  const resolveLink = (link: NavigationLinkConfig) => {
    if (!link.id || ids.has(link.id)) {
      throw new Error(`Duplicate or empty Portal navigation ID: ${link.id}`);
    }
    ids.add(link.id);
    if (Boolean(link.page) === Boolean(link.path)) {
      throw new Error(
        `Navigation ${link.id} requires exactly one page or path`,
      );
    }
    const item = items.find(candidate =>
      link.page
        ? candidate.node.spec.id === link.page
        : candidate.href === link.path,
    );
    if (!item) return undefined;
    if (pages.has(item.href)) {
      throw new Error(`Duplicate Portal navigation page: ${item.href}`);
    }
    pages.add(item.href);
    return { id: link.id, title: link.title ?? item.title, item };
  };

  return configured.flatMap<ResolvedNavigationItem>(entry => {
    const placement = entry.placement ?? 'primary';
    if ('children' in entry) {
      if (!entry.title || 'page' in entry || 'path' in entry) {
        throw new Error(
          `Navigation group ${entry.id} requires a title and children only`,
        );
      }
      if (!entry.id || ids.has(entry.id)) {
        throw new Error(`Duplicate or empty Portal navigation ID: ${entry.id}`);
      }
      ids.add(entry.id);
      const children = entry.children.flatMap(child => {
        const resolved = resolveLink(child);
        return resolved ? [resolved] : [];
      });
      return children.length
        ? [{ id: entry.id, title: entry.title, placement, children }]
        : [];
    }
    const resolved = resolveLink(entry);
    return resolved ? [{ ...resolved, placement }] : [];
  });
}
