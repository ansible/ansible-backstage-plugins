import { rootRouteRef, eeRouteRef, eeDetailsRouteRef } from './routes';

it('keeps catalog roots distinct and parameter-free', () => {
  expect(new Set([rootRouteRef, eeRouteRef]).size).toBe(2);
  for (const route of [rootRouteRef, eeRouteRef]) {
    expect(route.params).toEqual([]);
  }
});

it('preserves immutable artifact identity on EE details', () => {
  expect(eeDetailsRouteRef.parent).toBe(eeRouteRef);
  expect(eeDetailsRouteRef.params).toEqual(['ref']);
  expect(eeDetailsRouteRef.path).toBe('/:ref');
});
