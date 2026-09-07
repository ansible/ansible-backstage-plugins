type InvalidateCallback = () => void;

const callbacks = new Set<InvalidateCallback>();

export const addCollectionsInvalidateCallback = (
  cb: InvalidateCallback,
): (() => void) => {
  callbacks.add(cb);
  return () => callbacks.delete(cb);
};

export const invalidateCollections = (): void => {
  callbacks.forEach(cb => cb());
};
