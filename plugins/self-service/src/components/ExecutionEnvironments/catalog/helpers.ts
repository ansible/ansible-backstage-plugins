/**
 * Resolve Edit/View URL to the EE definition file when it points at catalog-info.yaml.
 */
export function toEEDefinitionUrl(url: string, eeName: string): string {
  if (!url?.trim() || !eeName) return url ?? '';
  const t = url.replace(/^url:/i, '').trim();
  return t.includes('catalog-info.yaml')
    ? t.replace(/catalog-info\.yaml$/, `${eeName}.yaml`)
    : t;
}
