import { createApiRef } from '@backstage/core-plugin-api';
import { createOverridingApiHolder } from './createOverridingApiHolder';

const overrideRef = createApiRef<{ value: string }>({ id: 'test.override' });
const parentRef = createApiRef<{ value: string }>({ id: 'test.parent' });

describe('createOverridingApiHolder', () => {
  it('returns the override implementation when one is registered', () => {
    const parent = { get: jest.fn(() => ({ value: 'parent' })) };
    const holder = createOverridingApiHolder(parent as any, [
      [overrideRef, { value: 'override' }],
    ]);

    expect(holder.get(overrideRef)).toEqual({ value: 'override' });
    expect(parent.get).not.toHaveBeenCalled();
  });

  it('falls back to the parent holder for unregistered refs', () => {
    const parent = { get: jest.fn(() => ({ value: 'parent' })) };
    const holder = createOverridingApiHolder(parent as any, [
      [overrideRef, { value: 'override' }],
    ]);

    expect(holder.get(parentRef)).toEqual({ value: 'parent' });
    expect(parent.get).toHaveBeenCalledWith(parentRef);
  });
});
