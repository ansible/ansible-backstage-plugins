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

const mockNavigate = jest.fn();
const mockUsePermission = jest.fn().mockReturnValue({
  loading: false,
  allowed: true,
});

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/self-service/repositories/test-repo' }),
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
    </TestApiProvider>,
  );
};

describe('ApmeRepositoryHeaderActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('does not render Deregister for non-manual repos', async () => {
    await renderComponent(baseEntity);
    expect(screen.queryByText('Deregister')).not.toBeInTheDocument();
  });

  it('renders Deregister for manually-registered repos', async () => {
    await renderComponent(manualEntity);
    expect(screen.getByText('Deregister')).toBeInTheDocument();
  });

  it('does not render Deregister when delete permission is denied', async () => {
    mockUsePermission.mockReturnValue({
      loading: false,
      allowed: false,
    });
    await renderComponent(manualEntity);
    expect(screen.queryByText('Deregister')).not.toBeInTheDocument();
  });

  it('opens deregister dialog when Deregister is clicked', async () => {
    await renderComponent(manualEntity);
    fireEvent.click(screen.getByText('Deregister'));
    await waitFor(() => {
      expect(screen.getByText('Deregister repository?')).toBeInTheDocument();
    });
  });

  it('returns null when apme is disabled', async () => {
    mockConfigApi.getOptionalBoolean.mockReturnValue(false);
    const { container } = await renderComponent();
    expect(container).toBeEmptyDOMElement();
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
