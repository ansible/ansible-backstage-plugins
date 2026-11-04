import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import {
  configApiRef,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { NotificationProvider } from '@ansible/portal-plugin-sdk';
import { EEBuildDialog } from './EEBuildDialog';

beforeAll(() => {
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: { escape: (value: string) => value },
  });
});

function renderBuild(fetch: jest.Mock, onClose = jest.fn()) {
  render(
    <TestApiProvider
      apis={[
        [
          configApiRef,
          mockApis.config({
            data: {
              ansible: { rhaap: { baseUrl: 'https://hub.example.test/' } },
            },
          }),
        ],
        [
          discoveryApiRef,
          { getBaseUrl: async () => 'http://localhost/api/catalog' },
        ],
        [fetchApiRef, { fetch }],
      ]}
    >
      <NotificationProvider>
        <EEBuildDialog
          open
          entity={{
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'Component',
            metadata: { name: 'test-ee' },
          }}
          scmProvider="gitlab"
          scmToken="token"
          onClose={onClose}
        />
      </NotificationProvider>
    </TestApiProvider>,
  );
  return onClose;
}

it('dispatches the prototype catalog build payload with SCM authentication', async () => {
  const fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
  const onClose = renderBuild(fetch);
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Image name' }),
    'namespace/test-ee',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Build' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(fetch).toHaveBeenCalledWith(
    'http://localhost/api/catalog/ansible/ee/build',
    expect.objectContaining({
      headers: {
        'Content-Type': 'application/json',
        'X-Gitlab-Token': 'token',
      },
      body: JSON.stringify({
        entityRef: 'component:default/test-ee',
        registryType: 'pah',
        customRegistryUrl: 'hub.example.test',
        imageName: 'namespace/test-ee',
        imageTag: 'latest',
        verifyTls: true,
      }),
    }),
  );
});

it.each([
  [
    403,
    '{"error":"credential-marker"}',
    'You do not have permission to build this execution environment.',
  ],
  [
    400,
    'credential-marker',
    'The build request could not be accepted. Review the inputs and try again.',
  ],
  [
    500,
    '{"error":"credential-marker"}',
    'Unable to start the build (HTTP 500). Try again later.',
  ],
  [
    503,
    'credential-marker',
    'Unable to start the build (HTTP 503). Try again later.',
  ],
])(
  'keeps inputs and shows safe feedback for HTTP %s',
  async (status, body, message) => {
    const text = jest.fn(async () => body);
    const fetch = jest.fn().mockResolvedValue({
      ok: false,
      status,
      statusText: 'status-credential-marker',
      text,
    });
    const onClose = renderBuild(fetch);
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Image name' }),
      'namespace/test-ee',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Build' }));
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(screen.queryByText(/credential-marker/)).toBeNull();
    expect(text).not.toHaveBeenCalled();
    expect(
      (screen.getByRole('textbox', { name: 'Image name' }) as HTMLInputElement)
        .value,
    ).toBe('namespace/test-ee');
    expect(onClose).not.toHaveBeenCalled();
  },
);
