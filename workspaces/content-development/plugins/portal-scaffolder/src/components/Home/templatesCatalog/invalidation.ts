type InvalidateCallback = () => void;

const listeners = new Set<InvalidateCallback>();

/**
 * Subscribe to templates-catalog invalidation (e.g. after JT autocomplete refresh).
 * Mirrors CollectionsCatalog invalidation — soft refresh without remounting lists.
 */
export function addTemplatesCatalogInvalidateListener(
  listener: InvalidateCallback,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Ask the mounted catalog list to re-query the current page in place. */
export function invalidateTemplatesCatalog(): void {
  listeners.forEach(listener => listener());
}
