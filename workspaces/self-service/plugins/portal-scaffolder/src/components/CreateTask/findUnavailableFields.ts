/** Inspect nested/conditional/array UI schema before a native form can submit. */
export function findUnavailableFields(
  value: unknown,
  available: ReadonlySet<string>,
): string[] {
  const missing = new Set<string>();
  function inspect(node: unknown) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(inspect);
      return;
    }
    const record = node as Record<string, unknown>;
    if (
      typeof record['ui:field'] === 'string' &&
      !available.has(record['ui:field'])
    )
      missing.add(record['ui:field']);
    Object.values(record).forEach(inspect);
  }
  inspect(value);
  return [...missing].sort();
}
