/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core';
import { ApmeQualityTabLabel } from './ApmeQualityTabLabel';
import { SEVERITY_STYLES } from '@ansible/backstage-apme-common/severity';
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

  it('renders a severity pill badge colored by worst severity', async () => {
    renderLabel({
      total_violations: 5,
      severity_breakdown: { critical: 2, high: 3 },
    });
    const badge = await screen.findByText('5');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveStyle({
      backgroundColor: SEVERITY_STYLES.critical.background,
      color: SEVERITY_STYLES.critical.text,
    });
  });

  it('renders high-severity pill when high is worst', async () => {
    renderLabel({
      total_violations: 7,
      severity_breakdown: { high: 4, low: 3 },
    });
    const badge = await screen.findByText('7');
    expect(badge).toHaveStyle({
      backgroundColor: SEVERITY_STYLES.high.background,
    });
  });

  it('renders medium-severity pill when medium is worst', async () => {
    renderLabel({
      total_violations: 3,
      severity_breakdown: { medium: 3 },
    });
    const badge = await screen.findByText('3');
    expect(badge).toHaveStyle({
      backgroundColor: SEVERITY_STYLES.medium.background,
    });
  });

  it('renders default/neutral for low-only violations (no colored pill)', async () => {
    renderLabel({
      total_violations: 2,
      severity_breakdown: { low: 2 },
    });
    const count = await screen.findByText('2');
    expect(count).toBeInTheDocument();
    expect(count).not.toHaveStyle({
      backgroundColor: SEVERITY_STYLES.low.background,
    });
  });

  it('renders default/neutral for info-only violations (no colored pill)', async () => {
    renderLabel({
      total_violations: 1,
      severity_breakdown: { info: 1 },
    });
    const count = await screen.findByText('1');
    expect(count).toBeInTheDocument();
    expect(count).not.toHaveStyle({
      backgroundColor: SEVERITY_STYLES.info.background,
    });
  });

  it('shows plain count without pill when breakdown is missing', async () => {
    renderLabel({
      total_violations: 4,
      severity_breakdown: {},
    });
    const count = await screen.findByText('4');
    expect(count).toBeInTheDocument();
    expect(count).not.toHaveStyle({
      backgroundColor: SEVERITY_STYLES.critical.background,
    });
  });
});
