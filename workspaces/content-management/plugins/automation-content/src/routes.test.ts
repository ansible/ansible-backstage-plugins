import {
  rootRouteRef,
  eeRouteRef,
  eeDetailsRouteRef,
  collectionsRouteRef,
  collectionDetailsRouteRef,
} from './routes';

it('keeps catalog roots distinct and parameter-free', () => {
  expect(new Set([rootRouteRef, eeRouteRef, collectionsRouteRef]).size).toBe(3);
  for (const route of [rootRouteRef, eeRouteRef, collectionsRouteRef]) {
    expect(route.params).toEqual([]);
  }
});

it('preserves immutable artifact identity on EE details', () => {
  expect(eeDetailsRouteRef.parent).toBe(eeRouteRef);
  expect(eeDetailsRouteRef.params).toEqual(['ref']);
  expect(eeDetailsRouteRef.path).toBe('/:ref');
});

it('preserves namespaced collection identity', () => {
  expect(collectionDetailsRouteRef.parent).toBe(collectionsRouteRef);
  expect(collectionDetailsRouteRef.params).toEqual(['namespace', 'name']);
  expect(collectionDetailsRouteRef.path).toBe('/:namespace/:name');
});
