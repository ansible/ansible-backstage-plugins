/**
 * If the given URL points at catalog-info.yaml, returns the URL for the EE
 * definition file (e.g. {eeName}.yaml) so Edit/View open the definition file
 * instead of the catalog descriptor. Otherwise returns the URL unchanged.
 */
export function getEEDefinitionFileUrl(url: string, eeName: string): string {
  if (!url?.trim() || !eeName) return url;
  const trimmed = url.replace(/^url:/i, '').trim();
  if (trimmed.includes('catalog-info.yaml')) {
    return trimmed.replace(/catalog-info\.yaml$/, `${eeName}.yaml`);
  }
  return trimmed;
}
