/**
 * Catalog entity conflict detail from duplicate key detection.
 */
export type ConflictDetail = {
  /** Full entity key: kind:namespace/name */
  key: string;
  /** AAP annotation IDs from the first (kept) entity */
  firstAapIds: string;
  /** AAP annotation IDs from the duplicate (skipped) entity */
  duplicateAapIds: string;
};

/**
 * Format a conflict detail for display in logs and UI.
 *
 * Extracts kind and name from the entity key and returns a human-readable
 * string like "Group 'engineering'" instead of "Group:default/engineering".
 *
 * @param conflict - The conflict detail to format
 * @returns Human-readable conflict description
 */
export function formatConflictForDisplay(conflict: ConflictDetail): string {
  // Extract kind and name from key (e.g., "Group:default/engineering" -> "Group 'engineering'")
  const match = conflict.key.match(/^([^:]+):[^/]+\/(.+)$/);
  if (!match) return conflict.key;
  const [, kind, name] = match;
  return `${kind} '${name}'`;
}
