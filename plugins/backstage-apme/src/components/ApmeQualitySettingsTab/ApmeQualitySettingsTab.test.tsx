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
import { ApmeQualitySettingsTab } from './ApmeQualitySettingsTab';
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

describe('ApmeQualitySettingsTab', () => {
  const mockApmeApi = new MockApmeApiClient();

  const renderTab = () =>
    render(
      <MemoryRouter>
        <TestApiProvider
          apis={[
            [
              configApiRef,
              new ConfigReader({
                ansible: {
                  apme: {
                    enabled: true,
                    baseUrl: 'http://localhost:8080',
                    targetAnsibleCoreVersion: '2.16',
                  },
                },
              }),
            ],
            [apmeApiRef, mockApmeApi],
          ]}
        >
          <ThemeProvider theme={theme}>
            <ApmeQualitySettingsTab />
          </ThemeProvider>
        </TestApiProvider>
      </MemoryRouter>,
    );

  it('shows Preview chip on the Overview admin surface when enabled', async () => {
    renderTab();

    expect(
      await screen.findByText('Content quality scanning', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('preview-chip')).toBeInTheDocument();
    expect(screen.getByTestId('preview-feedback-link')).toBeInTheDocument();
  });

  it('shows read-only default scan target from app-config', async () => {
    renderTab();

    expect(await screen.findByDisplayValue('ansible-core 2.16')).toBeDisabled();
    expect(
      screen.getByText('ansible.apme.targetAnsibleCoreVersion'),
    ).toBeInTheDocument();
  });

  it('does not show Preview chip when APME is disabled', async () => {
    render(
      <MemoryRouter>
        <TestApiProvider
          apis={[
            [configApiRef, new ConfigReader({ ansible: { apme: { enabled: false } } })],
            [apmeApiRef, mockApmeApi],
          ]}
        >
          <ThemeProvider theme={theme}>
            <ApmeQualitySettingsTab />
          </ThemeProvider>
        </TestApiProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Content quality scanning is disabled/i),
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId('preview-chip')).not.toBeInTheDocument();
  });
});
