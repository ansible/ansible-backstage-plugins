/*
 * Copyright Red Hat
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { configApiRef } from '@backstage/core-plugin-api';
import { ConfigReader, type JsonObject } from '@backstage/config';
import type { Entity } from '@backstage/catalog-model';
import { MemoryRouter } from 'react-router-dom';
import { ApmeRepositoryHeaderActions } from './ApmeRepositoryHeaderActions';

const theme = createTheme();

const testEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'network-firewall',
    annotations: {
      'github.com/project-slug': 'acme-scm/network-firewall',
    },
  },
  spec: {
    repository_default_branch: 'main',
  },
};

function renderActions(
  config: JsonObject,
  onCloseMenu = jest.fn(),
) {
  return render(
    <MemoryRouter>
      <TestApiProvider
        apis={[[configApiRef, new ConfigReader(config)]]}
      >
        <ThemeProvider theme={theme}>
          <ApmeRepositoryHeaderActions
            context={{
              entity: testEntity,
              repoUrl: 'https://github.com/acme-scm/network-firewall',
              onCloseMenu,
            }}
            onCloseMenu={onCloseMenu}
          />
        </ThemeProvider>
      </TestApiProvider>
    </MemoryRouter>,
  );
}

describe('ApmeRepositoryHeaderActions', () => {
  const devSpacesBaseUrl = 'https://devspaces.example.com/';

  beforeEach(() => {
    jest.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows Edit in Dev Spaces when ansible.devSpaces.baseUrl is configured', () => {
    renderActions({
      ansible: {
        apme: { enabled: true },
        devSpaces: { baseUrl: devSpacesBaseUrl },
      },
    });

    expect(screen.getByText('Edit in Dev Spaces')).toBeInTheDocument();
  });

  it('hides Edit in Dev Spaces when devSpaces.baseUrl is not configured', () => {
    renderActions({
      ansible: {
        apme: { enabled: true },
      },
    });

    expect(screen.queryByText('Edit in Dev Spaces')).not.toBeInTheDocument();
  });

  it('opens Dev Spaces factory URL with baseUrl and repo branch', () => {
    const onCloseMenu = jest.fn();
    renderActions(
      {
        ansible: {
          apme: { enabled: true },
          devSpaces: { baseUrl: devSpacesBaseUrl },
        },
      },
      onCloseMenu,
    );

    fireEvent.click(screen.getByText('Edit in Dev Spaces'));

    expect(window.open).toHaveBeenCalledWith(
      'https://devspaces.example.com/#https://github.com/acme-scm/network-firewall/tree/main',
      '_blank',
      'noopener,noreferrer',
    );
    expect(onCloseMenu).toHaveBeenCalled();
  });
});
