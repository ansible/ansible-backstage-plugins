/*
 * Copyright Red Hat
 */

import '@testing-library/jest-dom';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import {
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { TestApiProvider, renderInTestApp } from '@backstage/test-utils';
import { Entity } from '@backstage/catalog-model';
import { gitRepositoriesCatalogApiRef } from '@ansible/backstage-rhaap-common/gitRepositoriesCatalog';
import { DeregisterRepositoryDialog } from './DeregisterRepositoryDialog';

const mockEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'test-org-test-repo-github-manual',
    title: 'Test Repository',
    annotations: {
      'ansible.io/registration-method': 'manual',
    },
  },
  spec: {
    type: 'git-repository',
  },
};

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/catalog'),
};

const mockFetchApi = {
  fetch: jest.fn(),
};

const mockInvalidateCatalogCache = jest.fn();

const renderDialog = async (
  props: Partial<React.ComponentProps<typeof DeregisterRepositoryDialog>> = {},
) => {
  const defaultProps = {
    open: true,
    entity: mockEntity,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
  };
  const mergedProps = { ...defaultProps, ...props };

  return renderInTestApp(
    <TestApiProvider
      apis={[
        [discoveryApiRef, mockDiscoveryApi],
        [fetchApiRef, mockFetchApi],
        [
          gitRepositoriesCatalogApiRef,
          { invalidateCatalogCache: mockInvalidateCatalogCache },
        ],
      ]}
    >
      <DeregisterRepositoryDialog {...mergedProps} />
    </TestApiProvider>,
  );
};

describe('DeregisterRepositoryDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders dialog with entity name', async () => {
    await renderDialog();
    expect(screen.getByText('Deregister repository?')).toBeInTheDocument();
    expect(screen.getByText(/Test Repository/)).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = jest.fn();
    await renderDialog({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls deregister API and onConfirm on success', async () => {
    const onConfirm = jest.fn();
    mockFetchApi.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    await renderDialog({ onConfirm });
    fireEvent.click(screen.getByRole('button', { name: /^deregister$/i }));

    await waitFor(() => {
      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        'http://localhost:7007/api/catalog/ansible/git-repository',
        expect.objectContaining({
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled();
    });
    expect(mockInvalidateCatalogCache).toHaveBeenCalled();
  });

  it('does not invalidate catalog cache when deregister fails', async () => {
    mockFetchApi.fetch.mockResolvedValueOnce({
      ok: false,
      text: () =>
        Promise.resolve(JSON.stringify({ error: 'Something went wrong' })),
      statusText: 'Bad Request',
    });

    await renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /^deregister$/i }));

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
    expect(mockInvalidateCatalogCache).not.toHaveBeenCalled();
  });

  it('does not render when open is false', async () => {
    await renderDialog({ open: false });
    expect(
      screen.queryByText('Deregister repository?'),
    ).not.toBeInTheDocument();
  });
});
