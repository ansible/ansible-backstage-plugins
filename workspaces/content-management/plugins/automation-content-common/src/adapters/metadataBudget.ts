/** Metadata is much smaller than its containing archive. */
export const METADATA_DOCUMENT_BYTE_LIMIT = 1024 * 1024;
export const NORMALIZED_METADATA_BYTE_LIMIT = 2 * 1024 * 1024;
export const METADATA_NODE_LIMIT = 10000;
export const METADATA_DEPTH_LIMIT = 32;

/** Bound parsing input before constructing YAML/JSON trees. */
export function assertMetadataDocument(document: string): void {
  if (Buffer.byteLength(document) > METADATA_DOCUMENT_BYTE_LIMIT) {
    throw new Error('metadata document exceeds 1 MiB byte budget');
  }
}

/** Bound normalized JSON work without serializing or recursively walking the tree. */
export function validateNormalizedMetadata(value: unknown): void {
  const pending = [{ value, depth: 0 }];
  const seen = new Set<object>();
  let nodes = 0;
  let bytes = 0;
  const charge = (text: string): void => {
    // Six bytes per UTF-8 byte bounds JSON escaping, including control characters.
    bytes += 2 + Buffer.byteLength(text) * 6;
    if (bytes > NORMALIZED_METADATA_BYTE_LIMIT)
      throw new Error('normalized metadata exceeds 2 MiB byte budget');
  };
  while (pending.length) {
    const current = pending.pop()!;
    if (++nodes > METADATA_NODE_LIMIT || current.depth > METADATA_DEPTH_LIMIT)
      throw new Error('metadata node/depth budget exceeded');
    const item = current.value;
    // Covers delimiters and even the longest finite JSON number representation.
    bytes += 32;
    if (typeof item === 'string') charge(item);
    else if (item !== null && typeof item === 'object') {
      if (seen.has(item))
        throw new Error(
          'recursive or shared metadata objects are not supported',
        );
      seen.add(item);
      const entries = Object.entries(item);
      if (nodes + pending.length + entries.length > METADATA_NODE_LIMIT)
        throw new Error('metadata node budget exceeded');
      for (const [key, child] of entries) {
        if (child === undefined && !Array.isArray(item)) continue;
        charge(key);
        pending.push({ value: child, depth: current.depth + 1 });
      }
    } else if (
      item !== null &&
      typeof item !== 'boolean' &&
      !(typeof item === 'number' && Number.isFinite(item))
    ) {
      throw new Error('metadata must contain only JSON values');
    }
    if (bytes > NORMALIZED_METADATA_BYTE_LIMIT)
      throw new Error('normalized metadata byte budget exceeded');
  }
}
