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

it.each([
  [eeDetailsRouteRef, eeRouteRef],
  [collectionDetailsRouteRef, collectionsRouteRef],
])('preserves namespaced identity on detail routes', (details, parent) => {
  expect(details.parent).toBe(parent);
  expect(details.params).toEqual(['namespace', 'name']);
  expect(details.path).toBe('/:namespace/:name');
});
