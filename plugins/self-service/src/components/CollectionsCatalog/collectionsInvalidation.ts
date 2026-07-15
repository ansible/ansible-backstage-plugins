type InvalidateCallback = () => void;

let callback: InvalidateCallback | null = null;

export const setCollectionsInvalidateCallback = (
  cb: InvalidateCallback,
): void => {
  callback = cb;
};

export const clearCollectionsInvalidateCallback = (): void => {
  callback = null;
};

export const invalidateCollections = (): void => {
  callback?.();
};
