import {
  addCollectionsInvalidateCallback,
  invalidateCollections,
} from './collectionsInvalidation';

describe('collectionsInvalidation', () => {
  it('calls registered callbacks on invalidate', () => {
    const cb = jest.fn();
    const unsubscribe = addCollectionsInvalidateCallback(cb);

    invalidateCollections();
    expect(cb).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('does not call unsubscribed callbacks', () => {
    const cb = jest.fn();
    const unsubscribe = addCollectionsInvalidateCallback(cb);

    unsubscribe();
    invalidateCollections();

    expect(cb).not.toHaveBeenCalled();
  });

  it('supports multiple callbacks', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    const unsub1 = addCollectionsInvalidateCallback(cb1);
    const unsub2 = addCollectionsInvalidateCallback(cb2);

    invalidateCollections();
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });
});
