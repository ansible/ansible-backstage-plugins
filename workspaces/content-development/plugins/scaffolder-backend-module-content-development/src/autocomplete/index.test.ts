jest.mock('./utils', () => ({
  getCollections: jest.fn(),
}));

import { getCollections } from './utils';
import { handleCollectionsAutocompleteRequest } from './index';

describe('handleCollectionsAutocompleteRequest', () => {
  const dependencies = {
    auth: {} as any,
    discovery: {} as any,
    logger: {} as any,
  };
  const mockGetCollections = getCollections as jest.MockedFunction<
    typeof getCollections
  >;

  beforeEach(() => jest.clearAllMocks());

  it('returns collection sources for collection_sources requests', async () => {
    mockGetCollections.mockResolvedValue({
      results: [
        {
          name: 'community.general',
          sources: ['Private Automation Hub / validated'],
        },
      ],
    } as any);

    await expect(
      handleCollectionsAutocompleteRequest({
        ...dependencies,
        resource: 'collection_sources',
        context: { collection: 'community.general' },
      }),
    ).resolves.toEqual({
      results: [
        {
          name: 'Private Automation Hub / validated',
          id: 'Private Automation Hub / validated',
        },
      ],
    });
  });

  it('returns versions for the requested source', async () => {
    const source = 'Github / github-public / org / repo';
    mockGetCollections.mockResolvedValue({
      results: [
        {
          name: 'community.general',
          versions: [
            {
              source,
              ref: 'main',
              version: '1.2.0',
              label: 'main / 1.2.0',
            },
            {
              source: 'Private Automation Hub / validated',
              ref: '1.1.0',
              version: '1.1.0',
              label: '1.1.0',
            },
          ],
          sourceVersions: { [source]: ['1.2.0'] },
        },
      ],
    } as any);

    await expect(
      handleCollectionsAutocompleteRequest({
        ...dependencies,
        resource: 'collection_versions',
        context: { collection: 'community.general', source },
      }),
    ).resolves.toEqual({
      results: [{ name: 'main / 1.2.0', version: '1.2.0' }],
    });
  });

  it('does not return collection objects for missing source or version metadata', async () => {
    mockGetCollections.mockResolvedValue({
      results: [{ name: 'community.general', sources: [], versions: [] }],
    } as any);

    await expect(
      handleCollectionsAutocompleteRequest({
        ...dependencies,
        resource: 'collection_sources',
        context: { collection: 'community.general' },
      }),
    ).resolves.toEqual({ results: [] });

    await expect(
      handleCollectionsAutocompleteRequest({
        ...dependencies,
        resource: 'collection_versions',
        context: { collection: 'community.general', source: 'missing' },
      }),
    ).resolves.toEqual({ results: [] });
  });

  it('returns collection results for the collections resource', async () => {
    const collections = [{ name: 'community.general', sources: [] }];
    mockGetCollections.mockResolvedValue({ results: collections } as any);

    await expect(
      handleCollectionsAutocompleteRequest({
        ...dependencies,
        resource: 'collections',
      }),
    ).resolves.toEqual({ results: collections });
  });
});
