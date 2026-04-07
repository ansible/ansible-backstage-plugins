import type { ComponentProps } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { configApiRef } from '@backstage/core-plugin-api';
import { ThemeProvider, createMuiTheme } from '@material-ui/core/styles';
import type { Entity } from '@backstage/catalog-model';
import { eeBuildApiRef } from '../../../apis';
import { NotificationProvider, notificationStore } from '../../notifications';
import { EEBuildDialog } from './EEBuildDialog';

const mockTriggerBuild = jest.fn();
const mockOnClose = jest.fn();

const mockEeBuildApi = {
  triggerBuild: mockTriggerBuild,
};

const mockConfigApi = {
  getOptionalString: jest.fn((key: string): string | undefined => {
    if (key === 'ansible.rhaap.baseUrl') {
      return 'https://aap.example.com';
    }
    return undefined;
  }),
};

const theme = createMuiTheme();

const testEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'test-ee',
    namespace: 'default',
  },
  spec: { type: 'execution-environment' },
};

function renderDialog(
  props: Partial<ComponentProps<typeof EEBuildDialog>> = {},
) {
  return render(
    <TestApiProvider
      apis={[
        [configApiRef, mockConfigApi],
        [eeBuildApiRef, mockEeBuildApi],
      ]}
    >
      <NotificationProvider>
        <ThemeProvider theme={theme}>
          <EEBuildDialog
            open
            entity={testEntity}
            githubToken="gh-mock-token"
            onClose={mockOnClose}
            {...props}
          />
        </ThemeProvider>
      </NotificationProvider>
    </TestApiProvider>,
  );
}

describe('EEBuildDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notificationStore.clearAll();
    mockTriggerBuild.mockResolvedValue({ accepted: true });
    mockConfigApi.getOptionalString.mockImplementation(
      (key: string): string | undefined => {
        if (key === 'ansible.rhaap.baseUrl') {
          return 'https://aap.example.com/';
        }
        return undefined;
      },
    );
  });

  it('renders title and entity name when open', () => {
    renderDialog();
    expect(
      screen.getByText('Build execution environment image'),
    ).toBeInTheDocument();
    expect(screen.getByText('test-ee')).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('shows warning notification when image name is empty', async () => {
    const showSpy = jest.spyOn(notificationStore, 'showNotification');
    const user = userEvent.setup();
    renderDialog();

    await user.clear(screen.getByTestId('ee-build-image-name'));
    await user.clear(screen.getByTestId('ee-build-image-tag'));
    await user.type(screen.getByTestId('ee-build-image-tag'), '1.0');

    await user.click(screen.getByRole('button', { name: /^Build$/i }));

    await waitFor(() => {
      expect(showSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Cannot build',
          description: 'Image name is required.',
          severity: 'warning',
        }),
      );
    });
    expect(mockTriggerBuild).not.toHaveBeenCalled();
    showSpy.mockRestore();
  });

  it('shows warning when custom registry is selected without URL', async () => {
    const showSpy = jest.spyOn(notificationStore, 'showNotification');
    const user = userEvent.setup();
    renderDialog();

    fireEvent.mouseDown(
      screen.getByRole('button', { name: /Private Automation Hub \(PAH\)/i }),
    );
    fireEvent.click(
      await screen.findByRole('option', { name: /Custom registry/i }),
    );

    await user.type(screen.getByTestId('ee-build-image-name'), 'ns/ee');
    await user.click(screen.getByRole('button', { name: /^Build$/i }));

    await waitFor(() => {
      expect(showSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Cannot build',
          severity: 'warning',
          description: expect.stringContaining('Custom registry URL'),
        }),
      );
    });
    expect(mockTriggerBuild).not.toHaveBeenCalled();
    showSpy.mockRestore();
  });

  it('shows warning when PAH is selected but ansible.rhaap.baseUrl is missing', async () => {
    const showSpy = jest.spyOn(notificationStore, 'showNotification');
    const user = userEvent.setup();
    mockConfigApi.getOptionalString.mockReturnValue(undefined);

    renderDialog();
    await user.type(screen.getByTestId('ee-build-image-name'), 'ns/ee');
    await user.click(screen.getByRole('button', { name: /^Build$/i }));

    await waitFor(() => {
      expect(showSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Cannot build',
          severity: 'warning',
          description: expect.stringContaining('ansible.rhaap.baseUrl'),
        }),
      );
    });
    expect(mockTriggerBuild).not.toHaveBeenCalled();
    showSpy.mockRestore();
  });

  it('calls triggerBuild with PAH payload and shows success notification', async () => {
    const showSpy = jest.spyOn(notificationStore, 'showNotification');
    const user = userEvent.setup();
    mockTriggerBuild.mockResolvedValue({
      accepted: true,
      workflowId: 'wf-99',
    });

    renderDialog();

    await user.type(screen.getByTestId('ee-build-image-name'), 'my-ns/my-ee');
    await user.clear(screen.getByTestId('ee-build-image-tag'));
    await user.type(screen.getByTestId('ee-build-image-tag'), '2.0');

    await user.click(screen.getByRole('button', { name: /^Build$/i }));

    await waitFor(() => {
      expect(mockTriggerBuild).toHaveBeenCalledWith(
        expect.objectContaining({
          entityRef: 'component:default/test-ee',
          registryType: 'pah',
          customRegistryUrl: 'aap.example.com',
          imageName: 'my-ns/my-ee',
          imageTag: '2.0',
          verifyTls: true,
        }),
        { githubToken: 'gh-mock-token' },
      );
    });

    await waitFor(() => {
      expect(showSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Build triggered',
          description: 'Build workflow id: wf-99',
          severity: 'success',
        }),
      );
    });
    expect(mockOnClose).toHaveBeenCalled();
    showSpy.mockRestore();
  });

  it('shows error notification when triggerBuild returns accepted false', async () => {
    const showSpy = jest.spyOn(notificationStore, 'showNotification');
    const user = userEvent.setup();
    mockTriggerBuild.mockResolvedValue({
      accepted: false,
      message: 'catalog offline',
    });

    renderDialog();
    await user.type(screen.getByTestId('ee-build-image-name'), 'ns/ee');
    await user.click(screen.getByRole('button', { name: /^Build$/i }));

    await waitFor(() => {
      expect(showSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Build failed',
          description: 'catalog offline',
          severity: 'error',
        }),
      );
    });
    expect(mockOnClose).not.toHaveBeenCalled();
    showSpy.mockRestore();
  });

  it('shows custom registry URL field when Custom registry is chosen', async () => {
    renderDialog();
    fireEvent.mouseDown(
      screen.getByRole('button', { name: /Private Automation Hub \(PAH\)/i }),
    );
    fireEvent.click(
      await screen.findByRole('option', { name: /Custom registry/i }),
    );

    expect(
      screen.getByTestId('ee-build-custom-registry-url'),
    ).toBeInTheDocument();
  });

  it('calls triggerBuild with custom registry URL when custom is selected', async () => {
    const user = userEvent.setup();
    renderDialog();

    fireEvent.mouseDown(
      screen.getByRole('button', { name: /Private Automation Hub \(PAH\)/i }),
    );
    fireEvent.click(
      await screen.findByRole('option', { name: /Custom registry/i }),
    );

    await user.type(
      screen.getByTestId('ee-build-custom-registry-url'),
      'https://registry.custom.example',
    );
    await user.type(screen.getByTestId('ee-build-image-name'), 'ns/ee');
    await user.click(screen.getByRole('button', { name: /^Build$/i }));

    await waitFor(() => {
      expect(mockTriggerBuild).toHaveBeenCalledWith(
        expect.objectContaining({
          registryType: 'custom',
          customRegistryUrl: 'https://registry.custom.example',
        }),
        { githubToken: 'gh-mock-token' },
      );
    });
  });

  it('shows warning when githubToken is missing', async () => {
    const showSpy = jest.spyOn(notificationStore, 'showNotification');
    const user = userEvent.setup();
    renderDialog({ githubToken: null });

    await user.type(screen.getByTestId('ee-build-image-name'), 'ns/ee');
    await user.click(screen.getByRole('button', { name: /^Build$/i }));

    await waitFor(() => {
      expect(showSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Cannot build',
          severity: 'warning',
          description: expect.stringContaining('No Git token'),
        }),
      );
    });
    expect(mockTriggerBuild).not.toHaveBeenCalled();
    showSpy.mockRestore();
  });
});
