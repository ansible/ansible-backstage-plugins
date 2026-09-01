/*
 * Copyright Red Hat
 */

import '@testing-library/jest-dom';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import {
  configApiRef,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { TestApiProvider, renderInTestApp } from '@backstage/test-utils';
import { Entity } from '@backstage/catalog-model';
import { ApmeRepositoryHeaderActions } from './ApmeRepositoryHeaderActions';
import { ApmeDeregisterRepositoryOverlay } from '../ApmeDeregisterRepositoryOverlay';
import { deregisterRepositoryDialogStore } from '../ApmeDeregisterRepositoryOverlay';

const mockNavigate = jest.fn();
const mockUsePermission = jest.fn().mockReturnValue({
  loading: false,
  allowed: true,
});

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@backstage/plugin-permission-react', () => ({
  usePermission: (...args: unknown[]) => mockUsePermission(...args),
}));

const mockConfigApi = {
  getOptionalBoolean: jest.fn().mockReturnValue(true),
  getOptionalNumber: jest.fn(),
};

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/catalog'),
};

const mockFetchApi = {
  fetch: jest.fn(),
};

const baseEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'test-repo',
    annotations: {
      'backstage.io/source-location': 'url:https://github.com/org/repo',
    },
  },
  spec: {
    type: 'git-repository',
  },
};

const manualEntity: Entity = {
  ...baseEntity,
  metadata: {
    ...baseEntity.metadata,
    annotations: {
      ...baseEntity.metadata.annotations,
      'ansible.io/registration-method': 'manual',
    },
  },
};

const renderComponent = async (entity: Entity = baseEntity) => {
  const onCloseMenu = jest.fn();
  const context = {
    entity,
    repoUrl: 'https://github.com/org/repo',
    onCloseMenu,
    repositoriesCatalogPath: '/self-service/repositories/catalog',
  };

  return renderInTestApp(
    <TestApiProvider
      apis={[
        [configApiRef, mockConfigApi],
        [discoveryApiRef, mockDiscoveryApi],
        [fetchApiRef, mockFetchApi],
      ]}
    >
      <ApmeRepositoryHeaderActions context={context} onCloseMenu={onCloseMenu} />
      <ApmeDeregisterRepositoryOverlay context={context} />
    </TestApiProvider>,
  );
};

describe('ApmeRepositoryHeaderActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    deregisterRepositoryDialogStore.close();
    mockConfigApi.getOptionalBoolean.mockReturnValue(true);
    mockUsePermission.mockReturnValue({
      loading: false,
      allowed: true,
    });
  });

  it('renders Run quality scan menu item', async () => {
    await renderComponent();
    expect(screen.getByText('Run quality scan')).toBeInTheDocument();
  });

  it('does not render Remove for non-manual repos', async () => {
    await renderComponent(baseEntity);
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
  });

  it('renders Remove for manually-registered repos', async () => {
    await renderComponent(manualEntity);
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  it('does not render Remove when delete permission is denied', async () => {
    mockUsePermission.mockReturnValue({
      loading: false,
      allowed: false,
    });
    await renderComponent(manualEntity);
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
  });

  it('opens deregister dialog when Remove is clicked', async () => {
    await renderComponent(manualEntity);
    fireEvent.click(screen.getByText('Remove'));
    await waitFor(() => {
      expect(screen.getByText('Remove repository?')).toBeInTheDocument();
    });
  });

  it('returns null when apme is disabled', async () => {
    mockConfigApi.getOptionalBoolean.mockReturnValue(false);
    const { container } = await renderComponent();
    expect(container).toBeEmptyDOMElement();
  });

  it('hides Remove when showDeregister is false (catalog row context)', async () => {
    const onCloseMenu = jest.fn();
    const context = {
      entity: manualEntity,
      repoUrl: 'https://github.com/org/repo',
      onCloseMenu,
    };

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [configApiRef, mockConfigApi],
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ApmeRepositoryHeaderActions
          context={context}
          onCloseMenu={onCloseMenu}
          showDeregister={false}
        />
      </TestApiProvider>,
    );
    expect(screen.getByText('Run quality scan')).toBeInTheDocument();
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
  });

  it('returns null when repoUrl is not available', async () => {
    const onCloseMenu = jest.fn();
    const context = {
      entity: {
        ...baseEntity,
        metadata: { name: 'test', annotations: {} },
      },
      repoUrl: null,
      onCloseMenu,
    };

    const { container } = await renderInTestApp(
      <TestApiProvider
        apis={[
          [configApiRef, mockConfigApi],
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi],
        ]}
      >
        <ApmeRepositoryHeaderActions context={context} onCloseMenu={onCloseMenu} />
      </TestApiProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
