import '@testing-library/jest-dom';
import { render as renderComponent, screen } from '@testing-library/react';
import { TestApiProvider, wrapInTestApp } from '@backstage/test-utils';
import { automationContentApiRef } from '../api';
import { ArtifactDetailView, ArtifactListView } from './ArtifactViews';

jest.mock('@ansible/portal-plugin-sdk', () => ({
  SkeletonLoader: () => <div>Loading</div>,
}));

const render = (element: React.ReactElement) =>
  renderComponent(wrapInTestApp(element));

describe('artifact browsers', () => {
  const api = {
    listArtifacts: jest.fn(),
    getArtifact: jest.fn(),
    searchContentItems: jest.fn(),
  };
  beforeEach(() => {
    jest.resetAllMocks();
    api.listArtifacts.mockResolvedValue([]);
    api.getArtifact.mockResolvedValue({
      registry: 'fixtures',
      repository: 'example/skill',
      digest: 'sha256:123',
      tags: ['latest'],
      contentsKnown: false,
    });
    api.searchContentItems.mockResolvedValue({ totalItems: 0, items: [] });
  });
  it.each(['skill', 'collection'] as const)(
    'requests a dedicated %s list',
    async type => {
      render(
        <TestApiProvider apis={[[automationContentApiRef, api]]}>
          <ArtifactListView type={type} onOpen={jest.fn()} />
        </TestApiProvider>,
      );
      expect(
        await screen.findByText(`No ${type} artifacts discovered`),
      ).toBeInTheDocument();
      expect(api.listArtifacts).toHaveBeenCalledWith(type);
    },
  );
  it('treats missing enumeration as unknown rather than empty', async () => {
    render(
      <TestApiProvider apis={[[automationContentApiRef, api]]}>
        <ArtifactDetailView artifactRef="fixture" onOpenItem={jest.fn()} />
      </TestApiProvider>,
    );
    expect(await screen.findByText(/Contents are unknown/)).toBeInTheDocument();
    expect(screen.queryByText('No indexed items.')).not.toBeInTheDocument();
    expect(api.searchContentItems).toHaveBeenCalledWith({
      in: 'fixture',
      limit: 500,
    });
  });
  it('only reports empty items for complete enumeration', async () => {
    api.getArtifact.mockResolvedValue({
      registry: 'fixtures',
      repository: 'example/collection',
      enumeration: { status: 'complete', source: 'blob-fetch' },
    });
    render(
      <TestApiProvider apis={[[automationContentApiRef, api]]}>
        <ArtifactDetailView artifactRef="fixture" onOpenItem={jest.fn()} />
      </TestApiProvider>,
    );
    expect(await screen.findByText('No indexed items.')).toBeInTheDocument();
  });

  it('renders indexed skills with partial-enumeration warning and registry provenance', async () => {
    api.getArtifact.mockResolvedValue({
      registry: 'fixtures',
      repository: 'utopia/skills',
      metadata: {
        title: 'Utopia backup skills',
        description: 'Locally authored Utopia fixture',
        version: '0.4.2',
        source: 'https://example.test/utopia/skills',
      },
      enumeration: { status: 'partial', source: 'blob-fetch' },
    });
    api.searchContentItems.mockResolvedValue({
      totalItems: 1,
      items: [
        {
          fqcn: 'utopia-backup-validation',
          name: 'utopia-backup-validation',
          type: 'skill',
          shortDescription: 'Validate backups',
        },
      ],
    });
    render(
      <TestApiProvider apis={[[automationContentApiRef, api]]}>
        <ArtifactDetailView artifactRef="fixture" onOpenItem={jest.fn()} />
      </TestApiProvider>,
    );
    expect(
      await screen.findByText('utopia-backup-validation'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Enumeration is partial/)).toBeInTheDocument();
    expect(
      screen.getByText('Locally authored Utopia fixture'),
    ).toBeInTheDocument();
    expect(screen.getByText('Utopia backup skills')).toBeInTheDocument();
    expect(screen.getByText('0.4.2')).toBeInTheDocument();
    expect(
      screen.getByText('https://example.test/utopia/skills'),
    ).toBeInTheDocument();
  });
});
