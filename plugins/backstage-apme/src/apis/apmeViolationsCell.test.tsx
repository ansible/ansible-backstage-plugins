/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core';
import type { Entity } from '@backstage/catalog-model';
import type { Project } from '@ansible/backstage-apme-common/types';
import { inlineTextColorForSeverity } from '@ansible/backstage-apme-common/severity';
import {
  ApmeViolationsCell,
  resetApmeProjectsFetchPromise,
} from './apmeViolationsCell';

const mockGetProjects = jest.fn();
const mockGetProjectByRepoUrl = jest.fn();
const mockApmeApi = {
  getProjects: mockGetProjects,
  getProjectByRepoUrl: mockGetProjectByRepoUrl,
};

jest.mock('../api', () => ({
  apmeApiRef: { id: 'plugin.apme.api' },
}));

jest.mock('@backstage/core-plugin-api', () => ({
  useApi: () => mockApmeApi,
}));

const entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'demo-repo',
    annotations: {
      'backstage.io/source-location': 'url:https://github.com/acme/demo',
    },
  },
  spec: { type: 'git-repository', repository_default_branch: 'main' },
} as Entity;

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
    last_scanned_at: '2026-01-02T00:00:00Z',
    has_scm_token: false,
    has_new_commits: false,
    ...partial,
  };
}

function renderCell(projects: Project[]) {
  mockGetProjects.mockResolvedValue(projects);
  return render(
    <ThemeProvider theme={createTheme()}>
      <ApmeViolationsCell entity={entity} />
    </ThemeProvider>,
  );
}

describe('ApmeViolationsCell', () => {
  beforeEach(() => {
    resetApmeProjectsFetchPromise();
    mockGetProjects.mockReset();
    mockGetProjectByRepoUrl.mockReset();
    mockGetProjectByRepoUrl.mockResolvedValue(null);
  });

  it('renders Not scanned when the repo is not in the project map', async () => {
    renderCell([
      project({
        id: 'other',
        total_violations: 0,
        repo_url: 'https://github.com/acme/other',
      }),
    ]);
    expect(await screen.findByText('Not scanned')).toBeInTheDocument();
  });

  it('renders Not scanned when scan_count is zero and last_scanned_at is missing', async () => {
    renderCell([
      project({
        id: 'p1',
        total_violations: 0,
        scan_count: 0,
        last_scanned_at: undefined,
      }),
    ]);
    expect(await screen.findByText('Not scanned')).toBeInTheDocument();
  });

  it('renders No violations when total_violations is zero', async () => {
    renderCell([project({ id: 'p1', total_violations: 0 })]);
    expect(await screen.findByText('✓ No violations')).toBeInTheDocument();
  });

  it('renders Scanning when the project has an active operation', async () => {
    renderCell([
      project({
        id: 'p1',
        total_violations: 0,
        active_operation: { operation_id: 'op-1', status: 'scanning' },
      }),
    ]);
    expect(await screen.findByText('Scanning…')).toBeInTheDocument();
  });

  it('renders neutral gray count when violations exist but breakdown is missing', async () => {
    renderCell([project({ id: 'p1', total_violations: 4 })]);
    const count = await screen.findByText('4');
    expect(count).toHaveStyle({ color: 'rgba(0, 0, 0, 0.54)' });
  });

  it('colors the count by worst severity when breakdown is present', async () => {
    renderCell([
      project({
        id: 'p1',
        total_violations: 5,
        severity_breakdown: { critical: 2, high: 3 },
      }),
    ]);
    const count = await screen.findByText('5');
    expect(count).toHaveStyle({
      color: inlineTextColorForSeverity('critical', 'light'),
    });
  });

  it('fetches project detail when list row needs severity enrichment', async () => {
    mockGetProjectByRepoUrl.mockResolvedValue(
      project({
        id: 'p1',
        total_violations: 3,
        severity_breakdown: { high: 3 },
      }),
    );
    renderCell([project({ id: 'p1', total_violations: 3 })]);

    await waitFor(() => {
      expect(mockGetProjectByRepoUrl).toHaveBeenCalledWith(
        'https://github.com/acme/demo',
        'main',
      );
    });

    await waitFor(() => {
      expect(screen.getByText('3')).toHaveStyle({
        color: inlineTextColorForSeverity('high', 'light'),
      });
    });
  });
});
