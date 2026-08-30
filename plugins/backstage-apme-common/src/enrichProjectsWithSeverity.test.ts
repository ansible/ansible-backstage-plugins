/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { enrichProjectsWithSeverityBreakdown } from './enrichProjectsWithSeverity';
import type { Project } from './types';

function project(
  partial: Partial<Project> & Pick<Project, 'id' | 'total_violations'>,
): Project {
  return {
    name: 'demo',
    repo_url: 'https://github.com/acme/demo',
    branch: 'main',
    created_at: '2026-01-01T00:00:00Z',
    health_score: 50,
    violation_trend: 'stable',
    scan_count: 1,
    has_scm_token: false,
    has_new_commits: false,
    ...partial,
  };
}

describe('enrichProjectsWithSeverityBreakdown', () => {
  it('fetches detail only for projects missing severity breakdown', async () => {
    const fetchDetail = jest.fn(
      async (
        projectId: string,
      ): Promise<Pick<Project, 'severity_breakdown'>> => ({
        severity_breakdown:
          projectId === 'p1' ? { critical: 3 } : { high: 2 },
      }),
    );

    const result = await enrichProjectsWithSeverityBreakdown(
      [
        project({ id: 'p1', total_violations: 3 }),
        project({ id: 'p2', total_violations: 0 }),
        project({
          id: 'p3',
          total_violations: 2,
          severity_breakdown: { high: 2 },
        }),
      ],
      fetchDetail,
    );

    expect(fetchDetail).toHaveBeenCalledTimes(1);
    expect(fetchDetail).toHaveBeenCalledWith('p1');
    expect(result[0].severity_breakdown).toEqual({ critical: 3 });
    expect(result[2].severity_breakdown).toEqual({ high: 2 });
  });

  it('returns original row when detail fetch fails', async () => {
    const row = project({ id: 'p1', total_violations: 1 });
    const result = await enrichProjectsWithSeverityBreakdown(
      [row],
      async () => {
        throw new Error('gateway down');
      },
    );
    expect(result[0]).toBe(row);
  });
});
