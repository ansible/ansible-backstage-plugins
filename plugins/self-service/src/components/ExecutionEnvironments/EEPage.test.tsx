import { screen, waitFor } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/test-utils';
import { identityApiRef } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import { EEPage } from './EEPage';

jest.mock('./TabviewPage', () => ({
  EETabs: () => <div data-testid="ee-tabs">EETabs Component</div>,
}));

describe('EEPage', () => {
  const mockIdentityApi = {
    getBackstageIdentity: jest.fn(),
    getCredentials: jest.fn(),
    getProfileInfo: jest.fn(),
  };

  const mockCatalogApi = {
    getEntityByRef: jest.fn(),
    getEntities: jest.fn(),
    getEntityFacets: jest.fn(),
    queryEntities: jest.fn(),
    refreshEntity: jest.fn(),
    getEntityAncestors: jest.fn(),
    getEntityRelations: jest.fn(),
    addLocation: jest.fn(),
    removeLocationById: jest.fn(),
    getLocationById: jest.fn(),
    getLocationByEntity: jest.fn(),
    getLocations: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const render = (children: JSX.Element) => {
    return renderInTestApp(
      <TestApiProvider
        apis={[
          [identityApiRef, mockIdentityApi],
          [catalogApiRef, mockCatalogApi],
        ]}
      >
        {children}
      </TestApiProvider>,
    );
  };

  const createMockUserEntity = (
    isSuperuser: boolean,
  ): Entity => ({
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'User',
    metadata: {
      name: 'test-user',
      annotations: isSuperuser
        ? { 'aap.platform/is_superuser': 'true' }
        : {},
    },
    spec: {},
  });

  describe('Loading state', () => {
    it('should show loading state initially', async () => {
      mockIdentityApi.getBackstageIdentity.mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  userEntityRef: 'user:default/test-user',
                  type: 'user',
                  ownershipEntityRefs: [],
                }),
              100,
            ),
          ),
      );

      await render(<EEPage />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should hide loading state after check completes', async () => {
      mockIdentityApi.getBackstageIdentity.mockResolvedValue({
        userEntityRef: 'user:default/test-user',
        type: 'user',
        ownershipEntityRefs: [],
      });
      mockCatalogApi.getEntityByRef.mockResolvedValue(
        createMockUserEntity(false),
      );

      await render(<EEPage />);

      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });
    });
  });

  describe('Superuser access', () => {
    it('should render EETabs for superuser with annotation set to "true"', async () => {
      mockIdentityApi.getBackstageIdentity.mockResolvedValue({
        userEntityRef: 'user:default/test-user',
        type: 'user',
        ownershipEntityRefs: [],
      });
      mockCatalogApi.getEntityByRef.mockResolvedValue(
        createMockUserEntity(true),
      );

      await render(<EEPage />);

      await waitFor(() => {
        expect(screen.getByTestId('ee-tabs')).toBeInTheDocument();
      });

      expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
  });

  describe('Non-superuser access', () => {
    it('should show access denied for user without superuser annotation', async () => {
      mockIdentityApi.getBackstageIdentity.mockResolvedValue({
        userEntityRef: 'user:default/test-user',
        type: 'user',
        ownershipEntityRefs: [],
      });
      mockCatalogApi.getEntityByRef.mockResolvedValue(
        createMockUserEntity(false),
      );

      await render(<EEPage />);

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument();
      });

      expect(
        screen.getByText('You do not have permission to access this page.'),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('ee-tabs')).not.toBeInTheDocument();
    });

    it('should show access denied for user with annotation set to "false"', async () => {
      mockIdentityApi.getBackstageIdentity.mockResolvedValue({
        userEntityRef: 'user:default/test-user',
        type: 'user',
        ownershipEntityRefs: [],
      });
      mockCatalogApi.getEntityByRef.mockResolvedValue({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'User',
        metadata: {
          name: 'test-user',
          annotations: { 'aap.platform/is_superuser': 'false' },
        },
        spec: {},
      });

      await render(<EEPage />);

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('ee-tabs')).not.toBeInTheDocument();
    });

    it('should show access denied for user with annotation set to empty string', async () => {
      mockIdentityApi.getBackstageIdentity.mockResolvedValue({
        userEntityRef: 'user:default/test-user',
        type: 'user',
        ownershipEntityRefs: [],
      });
      mockCatalogApi.getEntityByRef.mockResolvedValue({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'User',
        metadata: {
          name: 'test-user',
          annotations: { 'aap.platform/is_superuser': '' },
        },
        spec: {},
      });

      await render(<EEPage />);

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('ee-tabs')).not.toBeInTheDocument();
    });
  });

  describe('Missing user entity ref', () => {
    it('should show access denied when userEntityRef is missing', async () => {
      mockIdentityApi.getBackstageIdentity.mockResolvedValue({
        userEntityRef: undefined,
        type: 'user',
        ownershipEntityRefs: [],
      });

      await render(<EEPage />);

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument();
      });

      expect(mockCatalogApi.getEntityByRef).not.toHaveBeenCalled();
      expect(screen.queryByTestId('ee-tabs')).not.toBeInTheDocument();
    });

    it('should show access denied when userEntityRef is null', async () => {
      mockIdentityApi.getBackstageIdentity.mockResolvedValue({
        userEntityRef: null as any,
        type: 'user',
        ownershipEntityRefs: [],
      });

      await render(<EEPage />);

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument();
      });

      expect(mockCatalogApi.getEntityByRef).not.toHaveBeenCalled();
      expect(screen.queryByTestId('ee-tabs')).not.toBeInTheDocument();
    });
  });

  describe('Error handling', () => {
    it('should show access denied when identity API throws an error', async () => {
      mockIdentityApi.getBackstageIdentity.mockRejectedValue(
        new Error('Failed to get identity'),
      );

      await render(<EEPage />);

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument();
      });

      expect(mockCatalogApi.getEntityByRef).not.toHaveBeenCalled();
      expect(screen.queryByTestId('ee-tabs')).not.toBeInTheDocument();
    });

    it('should show access denied when catalog API throws an error', async () => {
      mockIdentityApi.getBackstageIdentity.mockResolvedValue({
        userEntityRef: 'user:default/test-user',
        type: 'user',
        ownershipEntityRefs: [],
      });
      mockCatalogApi.getEntityByRef.mockRejectedValue(
        new Error('Failed to fetch user entity'),
      );

      await render(<EEPage />);

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('ee-tabs')).not.toBeInTheDocument();
    });

    it('should show access denied when user entity does not exist in catalog', async () => {
      mockIdentityApi.getBackstageIdentity.mockResolvedValue({
        userEntityRef: 'user:default/non-existent-user',
        type: 'user',
        ownershipEntityRefs: [],
      });
      mockCatalogApi.getEntityByRef.mockRejectedValue(
        new Error('Entity not found'),
      );

      await render(<EEPage />);

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('ee-tabs')).not.toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('should handle user entity with no metadata', async () => {
      mockIdentityApi.getBackstageIdentity.mockResolvedValue({
        userEntityRef: 'user:default/test-user',
        type: 'user',
        ownershipEntityRefs: [],
      });
      mockCatalogApi.getEntityByRef.mockResolvedValue({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'User',
        metadata: {},
        spec: {},
      });

      await render(<EEPage />);

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('ee-tabs')).not.toBeInTheDocument();
    });

    it('should handle user entity with no annotations', async () => {
      mockIdentityApi.getBackstageIdentity.mockResolvedValue({
        userEntityRef: 'user:default/test-user',
        type: 'user',
        ownershipEntityRefs: [],
      });
      mockCatalogApi.getEntityByRef.mockResolvedValue({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'User',
        metadata: {
          name: 'test-user',
        },
        spec: {},
      });

      await render(<EEPage />);

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('ee-tabs')).not.toBeInTheDocument();
    });

    it('should handle user entity with different annotation value', async () => {
      mockIdentityApi.getBackstageIdentity.mockResolvedValue({
        userEntityRef: 'user:default/test-user',
        type: 'user',
        ownershipEntityRefs: [],
      });
      mockCatalogApi.getEntityByRef.mockResolvedValue({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'User',
        metadata: {
          name: 'test-user',
          annotations: { 'aap.platform/is_superuser': 'yes' },
        },
        spec: {},
      });

      await render(<EEPage />);

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('ee-tabs')).not.toBeInTheDocument();
    });
  });
});

