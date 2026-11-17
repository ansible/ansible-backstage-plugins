import { useState } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createFrontendPlugin,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { renderTestApp } from '@backstage/frontend-test-utils';
import type { FieldExtensionComponentProps } from '@backstage/plugin-scaffolder-react';
import { Navigate } from 'react-router-dom';
import { automationContentApiRef } from '../../api';
import { EEImageVersionPicker } from './EEImageVersionPicker';

const controllerRepository = { registry: 'local', repository: 'demo/image' };
const image = 'registry.example.test/demo/image';
const tags = [
  { tag: 'stable', digest: 'sha256:abc123' },
  { tag: 'latest', digest: 'sha256:def456' },
].map(tag => ({
  ...tag,
  artifactRef: `local/demo/image@${tag.digest}`,
  taggedPullReference: `${image}:${tag.tag}`,
}));

function mount(initialReference: string) {
  function Picker() {
    const [reference, setReference] = useState<string | undefined>(
      initialReference,
    );
    return (
      <EEImageVersionPicker
        {...({} as FieldExtensionComponentProps<string>)}
        formData={reference}
        onChange={setReference}
      />
    );
  }
  return renderTestApp({
    features: [
      createFrontendPlugin({
        pluginId: 'version-picker-test',
        extensions: [
          PageBlueprint.make({
            name: 'source',
            params: {
              path: '/source',
              loader: async () => (
                <Navigate to="/picker" state={{ controllerRepository }} />
              ),
            },
          }),
          PageBlueprint.make({
            name: 'picker',
            params: { path: '/picker', loader: async () => <Picker /> },
          }),
        ],
      }),
    ],
    apis: [
      [
        automationContentApiRef,
        {
          getEERepository: async () => ({
            ...controllerRepository,
            entityRef: 'component:default/demo-image',
            representativeRef: tags[0].artifactRef,
            tags,
            digests: tags.map(({ artifactRef, digest }) => ({
              artifactRef,
              digest,
            })),
          }),
        },
      ],
    ],
    initialRouteEntries: ['/source'],
  });
}

// React Aria uses CSS.escape when moving focus. JSDOM does not expose it.
const cssDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'CSS');
beforeAll(() => {
  if (!globalThis.CSS?.escape) {
    Object.defineProperty(globalThis, 'CSS', {
      configurable: true,
      value: { escape: (value: string) => value.replace(/[^\w-]/g, '\\$&') },
    });
  }
});
afterAll(() => {
  if (cssDescriptor) Object.defineProperty(globalThis, 'CSS', cssDescriptor);
  else Reflect.deleteProperty(globalThis, 'CSS');
});

it('shows the selected tag digest as text and updates it with the selection', async () => {
  const user = userEvent.setup();
  mount(tags[0].taggedPullReference);

  const digest = await screen.findByRole('definition', {
    name: 'Image digest',
  });
  expect(screen.queryByRole('textbox', { name: 'Image digest' })).toBeNull();
  await waitFor(() => expect(digest.textContent).toBe(tags[0].digest));

  await user.click(screen.getByRole('button', { name: /stable Tags$/ }));
  await user.click(await screen.findByRole('option', { name: 'latest' }));
  expect(await screen.findByText(tags[1].taggedPullReference)).toBeTruthy();
  expect(digest.textContent).toBe(tags[1].digest);
});

it('shows the digest of a digest-pinned reference', async () => {
  const digest = 'sha256:987654';
  mount(`${image}@${digest}`);

  expect(
    (await screen.findByRole('definition', { name: 'Image digest' }))
      .textContent,
  ).toBe(digest);
});
