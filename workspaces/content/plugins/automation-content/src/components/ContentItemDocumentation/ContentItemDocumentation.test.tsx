import { render, screen } from '@testing-library/react';
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
