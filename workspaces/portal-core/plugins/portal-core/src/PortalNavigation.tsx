import { useApi, configApiRef } from '@backstage/core-plugin-api';
import {
  Sidebar,
  SidebarItem,
  SidebarDivider,
  SidebarSpace,
  SidebarScrollWrapper,
} from '@backstage/core-components';
import { useLocation } from 'react-router-dom';
import type {
  NavContentComponentProps,
  NavContentNavItem,
} from '@backstage/plugin-app-react';
import {
  resolveNavigationItems,
  type NavigationItemConfig,
  type ResolvedNavigationItem,
} from './navigationItems';
import { NavigationGroup } from './NavigationGroup';

export function selectNavigationItems(
  items: NavContentNavItem[],
  paths?: string[],
): NavContentNavItem[] {
  if (!paths) return items;
  // Exact host paths, not CSS/DOM selectors or contributor-defined placement.
  return paths.flatMap(path => items.filter(item => item.href === path));
}

export function partitionNavigationItems(
  items: NavContentNavItem[],
  bottomPaths: string[],
) {
  const bottom = new Set(bottomPaths);
  return {
    primary: items.filter(item => !bottom.has(item.href)),
    bottom: items.filter(item => bottom.has(item.href)),
  };
}

export function PortalNavigation({ navItems }: NavContentComponentProps) {
  const config = useApi(configApiRef);
  const discovered = navItems.rest();
  const configured = config.getOptional<NavigationItemConfig[]>(
    'portal.navigation.items',
  );
  const items = configured
    ? discovered
    : selectNavigationItems(
        discovered,
        config.getOptionalStringArray('portal.navigation.paths'),
      );
  const legacyGroups = partitionNavigationItems(
    items,
    config.getOptionalStringArray('portal.navigation.bottomPaths') ?? [],
  );
  const resolved: ResolvedNavigationItem[] = configured
    ? resolveNavigationItems(discovered, configured)
    : [
        ...legacyGroups.primary.map(item => ({
          id: item.node.spec.id,
          title: item.title,
          placement: 'primary' as const,
          item,
        })),
        ...legacyGroups.bottom.map(item => ({
          id: item.node.spec.id,
          title: item.title,
          placement: 'bottom' as const,
          item,
        })),
      ];
  const groups = {
    primary: resolved.filter(item => item.placement === 'primary'),
    bottom: resolved.filter(item => item.placement === 'bottom'),
  };
  const { pathname } = useLocation();
  const visibleItems = resolved.flatMap(entry =>
    'children' in entry
      ? entry.children.map(child => child.item)
      : [entry.item],
  );
  const activePath = visibleItems
    .filter(
      item => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const renderItem = (entry: ResolvedNavigationItem) =>
    'children' in entry ? (
      <NavigationGroup key={entry.id} entry={entry} activePath={activePath} />
    ) : (
      <SidebarItem
        key={entry.id}
        to={entry.item.href}
        end={entry.item.href !== activePath}
        icon={() => entry.item.icon}
        text={entry.title}
      />
    );
  return (
    <Sidebar>
      <div
        aria-hidden="true"
        style={{
          height: config.getOptionalNumber('portal.navigation.topOffset') ?? 0,
        }}
      />
      <SidebarScrollWrapper>
        {groups.primary.map(renderItem)}
      </SidebarScrollWrapper>
      <SidebarSpace />
      {groups.bottom.length > 0 && <SidebarDivider />}
      {groups.bottom.map(renderItem)}
    </Sidebar>
  );
}
