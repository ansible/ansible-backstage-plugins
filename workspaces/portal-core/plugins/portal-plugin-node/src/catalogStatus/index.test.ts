import {
  PortalCatalogStatusSources,
  portalCatalogStatusSourcesServiceRef,
} from './index';

it('fails clearly for missing and unready sources without exposing a write API', () => {
  const registry = new PortalCatalogStatusSources();
  expect(portalCatalogStatusSourcesServiceRef.scope).toBe('root');
  expect(() => registry.get('content.catalog-sync')).toThrow(/not registered/);
  let ready = false;
  const getStatus = jest.fn(() => ({ syncInProgress: false, providers: [] }));
  registry.register({
    id: 'content.catalog-sync',
    source: { isReady: () => ready, getStatus },
  });
  expect(() => registry.get('content.catalog-sync').getStatus()).toThrow(
    /not ready/,
  );
  expect(getStatus).not.toHaveBeenCalled();
  ready = true;
  expect(registry.get('content.catalog-sync').getStatus()).toEqual({
    syncInProgress: false,
    providers: [],
  });
  expect(() =>
    registry.register({
      id: 'content.catalog-sync',
      source: { isReady: () => true, getStatus },
    }),
  ).toThrow(/Duplicate/);
  expect(() =>
    new PortalCatalogStatusSources().get('content.catalog-sync'),
  ).toThrow(/not registered/);
});

it('validates contributor IDs and source capabilities before registration', () => {
  const registry = new PortalCatalogStatusSources();
  expect(() =>
    registry.register({
      id: 'content',
      source: { isReady: () => true, getStatus: () => ({}) },
    }),
  ).toThrow(/namespaced/);
  expect(() =>
    registry.register({ id: 'content.sync', source: {} as never }),
  ).toThrow(/Invalid/);
});
