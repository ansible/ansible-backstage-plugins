/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

/** Build repo-detail query params when the user selects a detail tab. */
export function buildRepositoryDetailTabSearchParams(
  current: URLSearchParams,
  tabId: string,
): URLSearchParams {
  const params = new URLSearchParams(current);

  if (tabId === 'overview') {
    params.delete('tab');
    params.delete('activity');
    params.delete('category');
    params.delete('rule');
    return params;
  }

  params.set('tab', tabId);

  if (tabId !== 'quality-activity') {
    params.delete('activity');
  }
  if (tabId === 'quality') {
    return params;
  }
  if (tabId === 'quality-activity') {
    params.delete('category');
    return params;
  }

  params.delete('category');
  params.delete('rule');

  return params;
}

/** Resolve the detail tab index from the current query string. */
export function getRepositoryDetailTabIndex(
  searchParams: URLSearchParams,
  detailTabs: ReadonlyArray<{ id: string }>,
): number {
  const requested = searchParams.get('tab');
  if (!requested || requested === 'overview') {
    const overviewIdx = detailTabs.findIndex(tab => tab.id === 'overview');
    return Math.max(overviewIdx, 0);
  }

  const idx = detailTabs.findIndex(tab => tab.id === requested);
  return Math.max(idx, 0);
}
