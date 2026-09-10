import { createHomeCatalogApi } from './createHomeCatalogApi';
import { buildVisibilityPredicate } from './buildVisibilityPredicate';

describe('createHomeCatalogApi', () => {
  const baseCatalogApi = {
    queryEntities: jest.fn().mockResolvedValue({ items: [], totalItems: 0 }),
    getEntities: jest.fn().mockResolvedValue({ items: [] }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('injects the visibility query for initial queryEntities requests', async () => {
    const api = createHomeCatalogApi(
      baseCatalogApi as any,
      [9],
      ['aap-template'],
    );

    await api.queryEntities({ filter: { kind: 'template' }, limit: 20 });

    expect(baseCatalogApi.queryEntities).toHaveBeenCalledWith({
      limit: 20,
      query: {
        $all: [
          buildVisibilityPredicate([9]),
          { kind: 'template' },
          {
            'metadata.annotations.ansible.com/template-source': {
              $in: ['aap-template'],
            },
          },
        ],
      },
    });
  });

  it('passes cursor-based queryEntities requests through unchanged', async () => {
    const api = createHomeCatalogApi(baseCatalogApi as any, [1], []);

    await api.queryEntities({ cursor: 'next-page' });

    expect(baseCatalogApi.queryEntities).toHaveBeenCalledWith({
      cursor: 'next-page',
    });
  });

  it('proxies non-queryEntities methods to the base catalog api', async () => {
    const api = createHomeCatalogApi(baseCatalogApi as any, [], []);

    await api.getEntities();

    expect(baseCatalogApi.getEntities).toHaveBeenCalled();
  });

  it('injects visibility query when queryEntities is called without a request', async () => {
    const api = createHomeCatalogApi(baseCatalogApi as any, [3], []);

    await api.queryEntities();

    expect(baseCatalogApi.queryEntities).toHaveBeenCalledWith({
      query: {
        $all: [buildVisibilityPredicate([3])],
      },
    });
  });

  it('returns non-function catalog api properties unchanged', () => {
    const catalogApiWithField = {
      ...baseCatalogApi,
      version: 'catalog-v1',
    };
    const api = createHomeCatalogApi(catalogApiWithField as any, [], []);

    expect((api as unknown as { version: string }).version).toBe('catalog-v1');
  });
});
