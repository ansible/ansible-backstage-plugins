/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import '@testing-library/jest-dom';
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import type { Entity } from '@backstage/catalog-model';
import type {
  ApmeProjectContext,
} from '../../hooks/useApmeProjectContext';
import type { Project, Violation } from '@ansible/backstage-apme-common/types';
import { ApmeRepositoryOverviewCard } from './ApmeRepositoryOverviewCard';

const mockUseApmeProjectContext = jest.fn<ApmeProjectContext, [Entity]>();
const mockUseApmeAiEnabled = jest.fn(() => true);

jest.mock('../../hooks/useApmeProjectContext', () => ({
  useApmeProjectContext: (entity: Entity) => mockUseApmeProjectContext(entity),
}));

jest.mock('../../hooks/useApmeEnabled', () => ({
  useApmeAiEnabled: () => mockUseApmeAiEnabled(),
}));

const entity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'terrible-playbook',
    annotations: {
      'backstage.io/source-location': 'url:https://github.com/acme/terrible-playbook',
    },
  },
  spec: {
    type: 'git-repository',
    repository_default_branch: 'main',
  },
};

function project(
  partial: Partial<Project> & Pick<Project, 'id' | 'total_violations'>,
): Project {
  return {
    name: 'terrible-playbook',
    repo_url: 'https://github.com/acme/terrible-playbook',
    branch: 'main',
    created_at: '2026-01-01T00:00:00Z',
    health_score: 40,
    violation_trend: 'stable',
    scan_count: 1,
    last_scanned_at: '2026-08-27T20:05:26Z',
    has_scm_token: false,
    has_new_commits: false,
    latest_scan: {
      scan_id: 'scan-416',
      scan_type: 'check',
      total_violations: 416,
      fixable: 188,
      ai_candidate: 188,
      manual_review: 226,
      remediated_count: 0,
    },
    ...partial,
  };
}

const violations: Violation[] = [
  {
    id: 1,
    rule_id: 'L003',
    level: 'low',
    message: 'Play should have a name',
    file: 'playbook-L057-wrong-module.yml',
    line: 4,
    remediation_class: 3,
    validator_source: 'native',
  },
  {
    id: 2,
    rule_id: 'R108',
    level: 'high',
    message: 'Unsafe permissions',
    file: 'tasks/main.yml',
    line: 12,
    remediation_class: 2,
    validator_source: 'native',
  },
];

function baseContext(
  overrides: Partial<ApmeProjectContext> = {},
): ApmeProjectContext {
  return {
    repoUrl: 'https://github.com/acme/terrible-playbook',
    branch: 'main',
    project: project({ id: 'proj-1', total_violations: 2 }),
    violations,
    rulesById: new Map(),
    dependencies: null,
    loading: false,
    violationsLoading: false,
    dependenciesLoading: false,
    error: undefined,
    refresh: jest.fn(),
    refreshViolations: jest.fn(),
    registerAndScan: jest.fn(),
    registering: false,
    registerError: null,
    ...overrides,
  };
}

function SearchParamsProbe() {
  const [searchParams] = useSearchParams();
  return <div data-testid="search-params">{searchParams.toString()}</div>;
}

function renderCard(
  initialSearch = '?tab=overview',
  contextOverrides: Partial<ApmeProjectContext> = {},
) {
  mockUseApmeProjectContext.mockReturnValue(baseContext(contextOverrides));

  return render(
    <MemoryRouter initialEntries={[`/repositories/terrible-playbook${initialSearch}`]}>
      <ThemeProvider theme={createTheme()}>
        <Routes>
          <Route
            path="/repositories/:name"
            element={
              <>
                <SearchParamsProbe />
                <ApmeRepositoryOverviewCard
                  context={{ entity } as ComponentProps<
                    typeof ApmeRepositoryOverviewCard
                  >['context']}
                />
              </>
            }
          />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('ApmeRepositoryOverviewCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseApmeAiEnabled.mockReturnValue(true);
  });

  it('navigates to the latest scan detail when the card is clicked', () => {
    renderCard();

    fireEvent.click(
      screen.getByRole('button', {
        name: /quality summary — view latest scan details/i,
      }),
    );

    expect(screen.getByTestId('search-params')).toHaveTextContent(
      'tab=quality-activity&activity=scan-416',
    );
  });

  it('navigates to quality activity list when latest_scan id is missing', () => {
    renderCard('?tab=overview', {
      project: project({
        id: 'proj-1',
        total_violations: 2,
        latest_scan: undefined,
      }),
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /quality summary — view latest scan details/i,
      }),
    );

    expect(screen.getByTestId('search-params')).toHaveTextContent(
      'tab=quality-activity',
    );
  });

  it('does not navigate when a category help icon is clicked', () => {
    renderCard();

    const helpIcon = screen.getByText('Lint').parentElement?.querySelector('svg');
    expect(helpIcon).toBeTruthy();
    fireEvent.click(helpIcon!);

    expect(screen.getByTestId('search-params')).toHaveTextContent('tab=overview');
  });

  it('opens the Quality tab from the unscanned Scan action', () => {
    renderCard('?tab=overview', {
      project: null,
      violations: [],
    });

    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    expect(screen.getByTestId('search-params')).toHaveTextContent('tab=quality');
  });

  it('navigates to the latest scan from the clean-scan card', () => {
    renderCard('?tab=overview', {
      project: project({ id: 'proj-1', total_violations: 0 }),
      violations: [],
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /quality summary — view latest scan details/i,
      }),
    );

    expect(screen.getByTestId('search-params')).toHaveTextContent(
      'tab=quality-activity&activity=scan-416',
    );
  });
});
