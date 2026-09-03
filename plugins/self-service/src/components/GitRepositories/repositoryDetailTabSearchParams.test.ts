/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import {
  buildRepositoryDetailTabSearchParams,
  getRepositoryDetailTabIndex,
} from './repositoryDetailTabSearchParams';

const DETAIL_TABS = [
  { id: 'overview' },
  { id: 'quality' },
  { id: 'quality-activity' },
  { id: 'ci-activity' },
];

describe('repositoryDetailTabSearchParams', () => {
  it('clears tab-specific params when returning to overview', () => {
    const current = new URLSearchParams(
      'tab=quality-activity&activity=scan-1&rule=L001&category=lint',
    );

    expect(
      buildRepositoryDetailTabSearchParams(current, 'overview').toString(),
    ).toBe('');
  });

  it('sets quality activity tab and preserves activity id', () => {
    const current = new URLSearchParams('tab=overview&category=lint');

    expect(
      buildRepositoryDetailTabSearchParams(
        current,
        'quality-activity',
      ).toString(),
    ).toBe('tab=quality-activity');
  });

  it('clears activity when leaving quality activity but keeps quality filters', () => {
    const current = new URLSearchParams(
      'tab=quality-activity&activity=scan-1&category=lint',
    );

    expect(
      buildRepositoryDetailTabSearchParams(current, 'quality').toString(),
    ).toBe('tab=quality&category=lint');
  });

  it('resolves overview when tab param is missing', () => {
    expect(
      getRepositoryDetailTabIndex(new URLSearchParams(), DETAIL_TABS),
    ).toBe(0);
  });

  it('resolves quality activity from the query string', () => {
    expect(
      getRepositoryDetailTabIndex(
        new URLSearchParams('tab=quality-activity&activity=scan-1'),
        DETAIL_TABS,
      ),
    ).toBe(2);
  });
});
