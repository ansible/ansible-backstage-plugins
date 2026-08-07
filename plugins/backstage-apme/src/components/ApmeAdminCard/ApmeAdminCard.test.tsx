/*
 * Copyright Red Hat
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { configApiRef } from '@backstage/core-plugin-api';
import { ConfigReader } from '@backstage/config';
import { ApmeAdminCard } from './ApmeAdminCard';
import { apmeApiRef } from '../../api';
import { MockApmeApiClient } from '../../api/mock/MockApmeApiClient';

const theme = createTheme();

describe('ApmeAdminCard', () => {
  const mockApmeApi = new MockApmeApiClient();

  it('shows Preview chip on the admin integration card when enabled', async () => {
    render(
      <TestApiProvider
        apis={[
          [
            configApiRef,
            new ConfigReader({
              ansible: { apme: { enabled: true, baseUrl: 'http://localhost:8080' } },
            }),
          ],
          [apmeApiRef, mockApmeApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <ApmeAdminCard />
        </ThemeProvider>
      </TestApiProvider>,
    );

    expect(await screen.findByText('APME Integration')).toBeInTheDocument();
    expect(screen.getByTestId('preview-chip')).toBeInTheDocument();
    expect(screen.getByTestId('preview-feedback-link')).toBeInTheDocument();
  });

  it('renders nothing when APME is disabled', () => {
    const { container } = render(
      <TestApiProvider
        apis={[
          [configApiRef, new ConfigReader({ ansible: { apme: { enabled: false } } })],
          [apmeApiRef, mockApmeApi],
        ]}
      >
        <ThemeProvider theme={theme}>
          <ApmeAdminCard />
        </ThemeProvider>
      </TestApiProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
