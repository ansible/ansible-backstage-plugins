/*
 * Copyright Red Hat
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TestApiProvider } from '@backstage/test-utils';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { configApiRef } from '@backstage/core-plugin-api';
import { ConfigReader } from '@backstage/config';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import { FleetQualityTab } from './FleetQualityTab';
import { apmeApiRef } from '../../api';
import { MockApmeApiClient } from '../../api/mock/MockApmeApiClient';

jest.mock('@backstage/core-components', () => {
  const actual = jest.requireActual('@backstage/core-components');
  return {
    ...actual,
    Progress: () => <div data-testid="progress">Loading...</div>,
  };
});

const theme = createTheme();

function catalogEntity(name: string, repoUrl: string): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name,
      annotations: {
        'backstage.io/source-location': `url:${repoUrl}`,
      },
    },
    spec: { type: 'git-repository' },
  };
}

describe('FleetQualityTab', () => {
  const mockApmeApi = new MockApmeApiClient();
  const repositoryDetailPath = (entityName: string, ruleId?: string) => {
    const base = `/self-service/repositories/${entityName}?tab=quality`;
    return ruleId ? `${base}&rule=${encodeURIComponent(ruleId)}` : base;
  };

  const renderTab = () =>
    render(
      <MemoryRouter>
        <TestApiProvider
          apis={[
            [
              configApiRef,
              new ConfigReader({ ansible: { apme: { enabled: true } } }),
            ],
            [apmeApiRef, mockApmeApi],
            [
              catalogApiRef,
              {
                getEntities: async () => ({
                  items: [
                    catalogEntity(
                      'amazon-aws-acme-scm-github-com',
                      'https://github.com/acme-scm/amazon.aws',
                    ),
                    catalogEntity(
                      'network-firewall-ansible-demo-github-com',
                      'https://github.com/ansible-demo/network-firewall',
                    ),
                  ],
                }),
              },
            ],
          ]}
        >
          <ThemeProvider theme={theme}>
            <FleetQualityTab repositoryDetailPath={repositoryDetailPath} />
          </ThemeProvider>
        </TestApiProvider>
      </MemoryRouter>,
    );

  it('renders fleet summary, Preview chip, and grouped violations from mock fixtures', async () => {
    renderTab();

    expect(
      await screen.findByText('Fleet quality', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('preview-chip')).toHaveTextContent(
      'Early access preview',
    );
    expect(screen.getByTestId('preview-feedback-link')).toBeInTheDocument();
    expect(
      await screen.findByText(
        /violations · .* rules · .* repositories/i,
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();

    await waitFor(
      () => {
        expect(
          screen.queryByText('No violations match the current filter.'),
        ).not.toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it('shows disabled message when APME is not enabled', async () => {
    render(
      <MemoryRouter>
        <TestApiProvider
          apis={[
            [
              configApiRef,
              new ConfigReader({ ansible: { apme: { enabled: false } } }),
            ],
            [apmeApiRef, mockApmeApi],
            [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
          ]}
        >
          <ThemeProvider theme={theme}>
            <FleetQualityTab repositoryDetailPath={repositoryDetailPath} />
          </ThemeProvider>
        </TestApiProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/Content quality scanning is disabled/i),
    ).toBeInTheDocument();
  });
});
