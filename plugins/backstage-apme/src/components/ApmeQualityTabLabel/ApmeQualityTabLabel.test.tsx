/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core';
import { ApmeQualityTabLabel } from './ApmeQualityTabLabel';
import type { Entity } from '@backstage/catalog-model';

const mockGetProjectByRepoUrl = jest.fn();

jest.mock('../../api', () => ({
  apmeApiRef: { id: 'plugin.apme.api' },
}));

jest.mock('@backstage/core-plugin-api', () => ({
  useApi: () => ({
    getProjectByRepoUrl: mockGetProjectByRepoUrl,
  }),
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

function renderLabel(project: unknown) {
  mockGetProjectByRepoUrl.mockResolvedValue(project);
  return render(
    <ThemeProvider theme={createTheme()}>
      <ApmeQualityTabLabel
        context={{
          entity,
          repoUrl: 'https://github.com/acme/demo',
        }}
      />
    </ThemeProvider>,
  );
}

describe('ApmeQualityTabLabel', () => {
  beforeEach(() => {
    mockGetProjectByRepoUrl.mockReset();
  });

  it('renders plain Quality when there are no violations', async () => {
    renderLabel({ total_violations: 0 });
    expect(await screen.findByText('Quality')).toBeInTheDocument();
    expect(screen.queryByText(/CRITICAL|HIGH|MEDIUM/)).not.toBeInTheDocument();
  });

  it('shows worst severity suffix when breakdown is present', async () => {
    renderLabel({
      total_violations: 5,
      severity_breakdown: { critical: 2, high: 3 },
    });
    expect(await screen.findByText(/5 \(2 CRITICAL\)/)).toBeInTheDocument();
  });

  it('omits severity suffix when breakdown is missing', async () => {
    renderLabel({
      total_violations: 4,
      severity_breakdown: {},
    });
    expect(await screen.findByText('4')).toBeInTheDocument();
    expect(screen.queryByText(/CRITICAL|HIGH|MEDIUM/)).not.toBeInTheDocument();
  });
});
