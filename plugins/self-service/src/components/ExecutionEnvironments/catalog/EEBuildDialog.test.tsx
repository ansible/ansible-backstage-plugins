import type { ComponentProps, ReactNode } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { configApiRef } from '@backstage/core-plugin-api';
import { ThemeProvider, createMuiTheme } from '@material-ui/core/styles';
import type { Entity } from '@backstage/catalog-model';
import { eeBuildApiRef } from '../../../apis';
import {
  NotificationProvider,
  NotificationStack,
  notificationStore,
  useNotifications,
} from '../../notifications';
import { EEBuildDialog } from './EEBuildDialog';

function EeBuildNotificationShell({ children }: { children: ReactNode }) {
  const { notifications, removeNotification } = useNotifications();
  return (
    <>
      {children}
      <NotificationStack
        notifications={notifications}
        onClose={removeNotification}
      />
    </>
  );
}

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
        <EeBuildNotificationShell>
          <ThemeProvider theme={theme}>
            <EEBuildDialog
              open
              entity={testEntity}
              githubToken="gh-mock-token"
              onClose={mockOnClose}
              {...props}
            />
          </ThemeProvider>
        </EeBuildNotificationShell>
      </NotificationProvider>
    </TestApiProvider>,
  );
}

async function submitBuildAndExpectTriggerBuildErrorDescription(
  rejectedValue: unknown,
  expectedDescription: string,
) {
  const showSpy = jest.spyOn(notificationStore, 'showNotification');
  const user = userEvent.setup();
  mockTriggerBuild.mockRejectedValueOnce(rejectedValue);

  renderDialog();
  await user.type(screen.getByTestId('ee-build-image-name'), 'ns/ee');
  await user.click(screen.getByRole('button', { name: /^Build$/i }));

  await waitFor(() => {
    expect(showSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Build failed',
        description: expectedDescription,
        severity: 'error',
      }),
    );
  });
  expect(mockOnClose).not.toHaveBeenCalled();
  showSpy.mockRestore();
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
      workflowUrl: 'https://github.com/acme/widgets/actions/runs/99001',
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
          severity: 'success',
        }),
      );
    });
    await waitFor(() => {
      expect(document.body.textContent).toContain('Link:');
      expect(document.body.textContent).not.toContain('Build workflow id:');
    });
    const runLink = screen.getByRole('link', {
      name: 'https://github.com/acme/widgets/actions/runs/99001',
    });
    expect(runLink).toHaveAttribute(
      'href',
      'https://github.com/acme/widgets/actions/runs/99001',
    );
    expect(runLink).toHaveAttribute('target', '_blank');
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

  it('shows error notification when triggerBuild throws', async () => {
    const showSpy = jest.spyOn(notificationStore, 'showNotification');
    const user = userEvent.setup();
    mockTriggerBuild.mockRejectedValueOnce(new Error('Network down'));

    renderDialog();
    await user.type(screen.getByTestId('ee-build-image-name'), 'ns/ee');
    await user.click(screen.getByRole('button', { name: /^Build$/i }));

    await waitFor(() => {
      expect(showSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Build failed',
          description: 'Network down',
          severity: 'error',
        }),
      );
    });
    expect(mockOnClose).not.toHaveBeenCalled();
    showSpy.mockRestore();
  });

  describe('Build failed notification when triggerBuild rejects (non-Error values)', () => {
    it('uses string rejection as description', async () => {
      expect.assertions(2);
      await submitBuildAndExpectTriggerBuildErrorDescription(
        'catalog timeout',
        'catalog timeout',
      );
    });

    it('stringifies plain object rejection with JSON.stringify', async () => {
      expect.assertions(2);
      await submitBuildAndExpectTriggerBuildErrorDescription(
        { reason: 'rate_limited' },
        '{"reason":"rate_limited"}',
      );
    });

    it('falls back when object is not JSON-serializable', async () => {
      expect.assertions(2);
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      await submitBuildAndExpectTriggerBuildErrorDescription(
        circular,
        'Something went wrong. Try again.',
      );
    });

    it('stringifies number rejection', async () => {
      expect.assertions(2);
      await submitBuildAndExpectTriggerBuildErrorDescription(503, '503');
    });

    it('stringifies boolean rejection', async () => {
      expect.assertions(2);
      await submitBuildAndExpectTriggerBuildErrorDescription(false, 'false');
    });

    it('stringifies bigint rejection', async () => {
      expect.assertions(2);
      await submitBuildAndExpectTriggerBuildErrorDescription(BigInt(99), '99');
    });

    it('formats symbol with description', async () => {
      expect.assertions(2);
      await submitBuildAndExpectTriggerBuildErrorDescription(
        Symbol('aborted'),
        'Symbol(aborted)',
      );
    });

    it('formats symbol without description', async () => {
      expect.assertions(2);
      await submitBuildAndExpectTriggerBuildErrorDescription(
        Symbol(),
        'Symbol',
      );
    });

    it('formats function rejection', async () => {
      expect.assertions(2);
      await submitBuildAndExpectTriggerBuildErrorDescription(
        () => {},
        'Unexpected function thrown as error',
      );
    });

    it('uses unknown error for undefined rejection', async () => {
      expect.assertions(2);
      await submitBuildAndExpectTriggerBuildErrorDescription(
        undefined,
        'Unknown error',
      );
    });
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
