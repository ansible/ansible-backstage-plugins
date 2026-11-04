import { act, render, screen } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import {
  AutomationContentClient,
  automationContentApiRef,
  type ContentItem,
} from '../../api';
import { ContentItemDocumentation } from './ContentItemDocumentation';

const doc: ContentItem = {
  fqcn: 'ansible.posix.mount',
  name: 'mount',
  collection: 'ansible.posix',
  collectionVersion: '1.0.0',
  type: 'module',
  description: ['Manage mounts'],
  notes: ['Requires privileges'],
  providedBy: ['r/repo@sha256:one'],
  enumeration: { status: 'partial', source: 'labels' },
  options: {
    path: {
      type: 'str',
      required: true,
      description: ['Mount point', 'Must be absolute'],
      suboptions: { nested: { type: 'bool', default: false } },
    },
  },
  examples: '- ansible.posix.mount:\n    path: /data',
  returns: { changed: { type: 'bool' } },
};

it('renders notes, all option descriptions, nested fields, examples and returns scoped to the artifact', async () => {
  const getContentItem = jest.fn().mockResolvedValue(doc);
  render(
    <TestApiProvider apis={[[automationContentApiRef, { getContentItem }]]}>
      <ContentItemDocumentation
        fqcn={doc.fqcn}
        inArtifact="r/repo@sha256:one"
      />
    </TestApiProvider>,
  );
  expect(await screen.findByText('Manage mounts')).toBeTruthy();
  expect(screen.getByText('Requires privileges')).toBeTruthy();
  expect(screen.getByText('Must be absolute')).toBeTruthy();
  expect(screen.getByText('nested')).toBeTruthy();
  expect(screen.getByText('Default: false')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Examples' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Return values' })).toBeTruthy();
  expect(getContentItem).toHaveBeenCalledWith(doc.fqcn, 'r/repo@sha256:one');
});

it('hides previous documentation while loading a different item and artifact', async () => {
  let resolveNext!: (value: ContentItem) => void;
  const nextRequest = new Promise<ContentItem>(resolve => {
    resolveNext = resolve;
  });
  const nextDoc: ContentItem = {
    ...doc,
    fqcn: 'ansible.posix.umount',
    name: 'umount',
    collectionVersion: '2.0.0',
    description: ['Unmount filesystems'],
    in: 'r/repo@sha256:two',
  };
  const getContentItem = jest
    .fn()
    .mockResolvedValueOnce(doc)
    .mockReturnValueOnce(nextRequest);
  const { rerender } = render(
    <TestApiProvider apis={[[automationContentApiRef, { getContentItem }]]}>
      <ContentItemDocumentation
        fqcn={doc.fqcn}
        inArtifact="r/repo@sha256:one"
      />
    </TestApiProvider>,
  );

  expect(await screen.findByText('Manage mounts')).toBeTruthy();

  rerender(
    <TestApiProvider apis={[[automationContentApiRef, { getContentItem }]]}>
      <ContentItemDocumentation
        fqcn={nextDoc.fqcn}
        inArtifact="r/repo@sha256:two"
      />
    </TestApiProvider>,
  );

  expect(screen.getByText('Loading documentation…')).toBeTruthy();
  expect(screen.queryByText('Manage mounts')).toBeNull();
  expect(screen.queryByText('Requires privileges')).toBeNull();
  expect(screen.getByRole('heading', { name: nextDoc.fqcn })).toBeTruthy();
  expect(getContentItem).toHaveBeenLastCalledWith(
    nextDoc.fqcn,
    'r/repo@sha256:two',
  );

  await act(async () => {
    resolveNext(nextDoc);
    await nextRequest;
  });
  expect(await screen.findByText('Unmount filesystems')).toBeTruthy();
  expect(screen.queryByText('Manage mounts')).toBeNull();
});

it('normalizes the unscoped variants response in the client', async () => {
  const client = new AutomationContentClient({
    discoveryApi: { getBaseUrl: async () => '/backend' },
    fetchApi: {
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          variants: [doc, { ...doc, in: 'r/repo@sha256:two' }],
        }),
      }),
    },
  });
  await expect(client.getContentItem(doc.fqcn)).resolves.toEqual(doc);
});

it.each([undefined, 'r/repo@sha256:two'])(
  'shows the documentation provider only when present: %s',
  async provider => {
    const getContentItem = jest
      .fn()
      .mockResolvedValue({ ...doc, in: provider });
    render(
      <TestApiProvider apis={[[automationContentApiRef, { getContentItem }]]}>
        <ContentItemDocumentation fqcn={doc.fqcn} />
      </TestApiProvider>,
    );
    await screen.findByText('Manage mounts');
    expect(screen.queryByText(/Documentation from/)?.textContent).toBe(
      provider ? `Documentation from ${provider}` : undefined,
    );
    expect(getContentItem).toHaveBeenCalledWith(doc.fqcn, undefined);
  },
);
