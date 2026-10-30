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

it('keeps the form open and preserves values after a failed build request', async () => {
  const fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 503,
    text: async () => 'Build service unavailable',
  });
  const onClose = renderBuild(fetch);
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Image name' }),
    'namespace/test-ee',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Build' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Build service unavailable',
  );
  expect(
    (screen.getByRole('textbox', { name: 'Image name' }) as HTMLInputElement)
      .value,
  ).toBe('namespace/test-ee');
  expect(onClose).not.toHaveBeenCalled();
});
