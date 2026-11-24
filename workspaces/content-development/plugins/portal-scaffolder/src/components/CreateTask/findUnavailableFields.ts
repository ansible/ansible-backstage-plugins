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
    const ui = record.ui;
    let fieldName: unknown;
    if (typeof record['ui:field'] === 'string') {
      fieldName = record['ui:field'];
    } else if (ui && typeof ui === 'object' && !Array.isArray(ui)) {
      fieldName = (ui as Record<string, unknown>).field;
    }
    if (typeof fieldName === 'string' && !available.has(fieldName))
      missing.add(fieldName);
    Object.values(record).forEach(inspect);
  }
  inspect(value);
  return [...missing].sort((a, b) => a.localeCompare(b));
}
