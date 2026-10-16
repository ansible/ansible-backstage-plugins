/** Catalog stitching is asynchronous. Retry reads, never the mutation. */
export async function reconcileSubjectRemoval(
  readSubject: () => Promise<unknown>,
  isCurrent: () => boolean,
  options: { attempts?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const { attempts = 45, intervalMs = 1000 } = options;
  for (let attempt = 0; attempt < attempts && isCurrent(); attempt++) {
    // CatalogApi returns undefined for a missing entity. Authorization and
    // transport failures must not be interpreted as confirmed removal.
    if ((await readSubject()) === undefined) return isCurrent();
    if (attempt + 1 < attempts && isCurrent()) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  return false;
}
