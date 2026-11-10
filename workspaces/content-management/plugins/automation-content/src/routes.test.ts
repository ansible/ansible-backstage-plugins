import { eeRouteRef, eeDetailsRouteRef } from './routes';

it('keeps the EE catalog root parameter-free', () => {
  expect(eeRouteRef.params).toEqual([]);
});

it('preserves immutable artifact identity on EE details', () => {
  expect(eeDetailsRouteRef.parent).toBe(eeRouteRef);
  expect(eeDetailsRouteRef.params).toEqual(['ref']);
  expect(eeDetailsRouteRef.path).toBe('/:ref');
});
