import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { configApiRef, alertApiRef } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { ThemeProvider, createMuiTheme } from '@material-ui/core/styles';
import type { Entity } from '@backstage/catalog-model';
import { UnregisterEntityDialog } from './UnregisterEntityDialog';

jest.mock('@backstage/core-components', () => ({
  ...jest.requireActual('@backstage/core-components'),
  Progress: () => <div data-testid="progress">Loading...</div>,
  ResponseErrorPanel: ({ error }: { error: Error }) => (
    <div data-testid="error-panel">{error.message}</div>
  ),
}));

jest.mock('@backstage/plugin-catalog-react', () => {
  const actual = jest.requireActual('@backstage/plugin-catalog-react');
  return {
    ...actual,
    EntityRefLink: ({ entityRef }: any) => (
      <span data-testid="entity-ref-link">
        {entityRef.kind}:{entityRef.namespace}/{entityRef.name}
      </span>
    ),
  };
});

const mockOnConfirm = jest.fn();
const mockOnClose = jest.fn();
const mockAlertPost = jest.fn();

const mockCatalogApi = {
  getLocationByRef: jest.fn(),
  getEntities: jest.fn(),
  removeLocationById: jest.fn(),
  removeEntityByUid: jest.fn(),
};

const mockConfigApi = {
  getOptionalString: jest.fn((_key: string) => 'Ansible RHDH'),
};

const mockAlertApi = {
  post: mockAlertPost,
  alert$: jest.fn(),
};

const theme = createMuiTheme();

const baseEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'test-ee',
    namespace: 'default',
    uid: 'test-uid-123',
    annotations: {
      'backstage.io/managed-by-origin-location':
        'url:https://github.com/org/repo/blob/main/catalog-info.yaml',
    },
  },
  spec: { type: 'execution-environment' },
};

function renderDialog(entity: Entity = baseEntity, open = true) {
  return render(
    <TestApiProvider
      apis={[
        [configApiRef, mockConfigApi],
        [alertApiRef, mockAlertApi],
        [catalogApiRef, mockCatalogApi],
      ]}
    >
      <ThemeProvider theme={theme}>
        <UnregisterEntityDialog
          open={open}
          entity={entity}
          onConfirm={mockOnConfirm}
          onClose={mockOnClose}
        />
      </ThemeProvider>
    </TestApiProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('UnregisterEntityDialog', () => {
  describe('rendering', () => {
    it('does not render content when closed', () => {
      mockCatalogApi.getLocationByRef.mockResolvedValue({
        id: 'loc-1',
        type: 'url',
        target:
          'https://github.com/org/repo/blob/main/catalog-info.yaml',
      });
      mockCatalogApi.getEntities.mockResolvedValue({ items: [] });

      renderDialog(baseEntity, false);
      expect(
        screen.queryByText(
          'Are you sure you want to unregister this entity?',
        ),
      ).not.toBeInTheDocument();
    });

    it('shows loading state while fetching prerequisites', () => {
      mockCatalogApi.getLocationByRef.mockReturnValue(
        new Promise(() => {}),
      );
      mockCatalogApi.getEntities.mockReturnValue(new Promise(() => {}));

      renderDialog();
      expect(screen.getByTestId('progress')).toBeInTheDocument();
    });

    it('shows error state when prerequisite fetch fails', async () => {
      mockCatalogApi.getLocationByRef.mockRejectedValue(
        new Error('Network error'),
      );
      mockCatalogApi.getEntities.mockResolvedValue({ items: [] });

      renderDialog();
      await waitFor(() => {
        expect(screen.getByTestId('error-panel')).toHaveTextContent(
          'Network error',
        );
      });
    });
  });

  describe('unregister state', () => {
    beforeEach(() => {
      mockCatalogApi.getLocationByRef.mockResolvedValue({
        id: 'loc-1',
        type: 'url',
        target:
          'https://github.com/org/repo/blob/main/catalog-info.yaml',
      });
      mockCatalogApi.getEntities.mockResolvedValue({
        items: [
          {
            kind: 'Component',
            metadata: {
              uid: 'test-uid-123',
              name: 'test-ee',
              namespace: 'default',
            },
          },
        ],
      });
    });

    it('shows dialog title and entity list', async () => {
      renderDialog();
      await waitFor(() => {
        expect(
          screen.getByText(
            'Are you sure you want to unregister this entity?',
          ),
        ).toBeInTheDocument();
        expect(
          screen.getByText(
            'This action will unregister the following entities:',
          ),
        ).toBeInTheDocument();
      });
    });

    it('shows location info', async () => {
      renderDialog();
      await waitFor(() => {
        expect(
          screen.getByText('Located at the following location:'),
        ).toBeInTheDocument();
      });
    });

    it('shows cancel and unregister buttons', async () => {
      renderDialog();
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /cancel/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /unregister location/i }),
        ).toBeInTheDocument();
      });
    });

    it('calls onClose when cancel is clicked', async () => {
      const user = userEvent.setup();
      renderDialog();
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /cancel/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls removeLocationById and onConfirm on unregister', async () => {
      const user = userEvent.setup();
      mockCatalogApi.removeLocationById.mockResolvedValue(undefined);

      renderDialog();
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /unregister location/i }),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole('button', { name: /unregister location/i }),
      );
      await waitFor(() => {
        expect(
          mockCatalogApi.removeLocationById,
        ).toHaveBeenCalledWith('loc-1');
        expect(mockOnConfirm).toHaveBeenCalled();
      });
    });

    it('posts alert on unregister failure', async () => {
      const user = userEvent.setup();
      mockCatalogApi.removeLocationById.mockRejectedValue(
        new Error('Permission denied'),
      );

      renderDialog();
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /unregister location/i }),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole('button', { name: /unregister location/i }),
      );
      await waitFor(() => {
        expect(mockAlertPost).toHaveBeenCalledWith({
          message: 'Permission denied',
        });
      });
    });

    it('shows advanced options with delete button', async () => {
      const user = userEvent.setup();
      renderDialog();
      await waitFor(() => {
        expect(screen.getByText('Advanced Options')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Advanced Options'));
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /delete entity/i }),
        ).toBeInTheDocument();
      });
    });
  });

  describe('only-delete state', () => {
    it('shows delete button when no location found', async () => {
      mockCatalogApi.getLocationByRef.mockResolvedValue(undefined);
      mockCatalogApi.getEntities.mockResolvedValue({ items: [] });

      renderDialog();
      await waitFor(() => {
        expect(
          screen.getByText(/does not seem to originate/),
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /delete entity/i }),
        ).toBeInTheDocument();
      });
    });

    it('calls removeEntityByUid and onConfirm on delete', async () => {
      const user = userEvent.setup();
      mockCatalogApi.getLocationByRef.mockResolvedValue(undefined);
      mockCatalogApi.getEntities.mockResolvedValue({ items: [] });
      mockCatalogApi.removeEntityByUid.mockResolvedValue(undefined);

      renderDialog();
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /delete entity/i }),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole('button', { name: /delete entity/i }),
      );
      await waitFor(() => {
        expect(
          mockCatalogApi.removeEntityByUid,
        ).toHaveBeenCalledWith('test-uid-123');
        expect(mockOnConfirm).toHaveBeenCalled();
        expect(mockAlertPost).toHaveBeenCalledWith({
          message: 'Removed entity test-ee',
          severity: 'success',
          display: 'transient',
        });
      });
    });
  });

  describe('bootstrap state', () => {
    it('shows info alert for bootstrap entities', async () => {
      const bootstrapEntity: Entity = {
        ...baseEntity,
        metadata: {
          ...baseEntity.metadata,
          annotations: {
            'backstage.io/managed-by-origin-location':
              'bootstrap:bootstrap',
          },
        },
      };

      renderDialog(bootstrapEntity);
      await waitFor(() => {
        expect(
          screen.getByText(/cannot unregister this entity/),
        ).toBeInTheDocument();
      });
    });
  });
});
