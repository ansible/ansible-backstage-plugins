import {
  addTemplatesCatalogInvalidateListener,
  invalidateTemplatesCatalog,
} from './invalidation';

describe('templatesCatalog invalidation', () => {
  it('notifies subscribers and supports unsubscribe', () => {
    const first = jest.fn();
    const second = jest.fn();
    const unsubscribe = addTemplatesCatalogInvalidateListener(first);
    addTemplatesCatalogInvalidateListener(second);

    invalidateTemplatesCatalog();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribe();
    invalidateTemplatesCatalog();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });
});
