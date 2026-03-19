import { Entity, ANNOTATION_EDIT_URL } from '@backstage/catalog-model';
import { createTarArchive } from '../../utils/tarArchiveUtils';

/**
 * Resolve Edit/View URL to the EE definition file when it points at catalog-info.yaml.
 */
export function toEEDefinitionUrl(url: string, eeName: string): string {
  if (!url?.trim() || !eeName) return url ?? '';
  const t = url.replace(/^url:/i, '').trim();
  return t.includes('catalog-info.yaml')
    ? t.replace(/catalog-info\.yaml$/, `${eeName}.yml`)
    : t;
}

/**
 * Returns the EE definition URL for an entity using its edit URL or source location annotation.
 * Prefers ANNOTATION_EDIT_URL, falls back to backstage.io/source-location (with url: prefix stripped).
 */
export function getEntityEEDefinitionUrl(entity: Entity): string {
  const raw =
    entity?.metadata?.annotations?.[ANNOTATION_EDIT_URL] ??
    entity?.metadata?.annotations?.['backstage.io/source-location'] ??
    '';
  const normalized = raw.replace(/^url:/i, '').trim();
  return toEEDefinitionUrl(normalized, entity?.metadata?.name ?? '');
}

/**
 * Builds a tar archive from an EE entity's spec and triggers a browser download.
 * Returns true if the download was started, false if validation failed or an error occurred.
 */
export function downloadEntityAsTarArchive(entity: Entity): boolean {
  if (
    !entity?.spec?.definition ||
    !entity?.spec?.readme ||
    !entity?.spec?.template
  ) {
    return false;
  }

  try {
    const name = entity.metadata?.name ?? 'execution-environment';
    const eeFileName = `${name}.yaml`;
    const readmeFileName = `README-${name}.md`;
    const archiveName = `${name}.tar`;
    const templateFileName = `${name}-template.yaml`;

    const rawdata: Array<{ name: string; content: string }> = [
      { name: eeFileName, content: String(entity.spec.definition) },
      { name: readmeFileName, content: String(entity.spec.readme) },
      { name: templateFileName, content: String(entity.spec.template) },
    ];

    if (entity.spec.ansible_cfg) {
      rawdata.push({
        name: 'ansible.cfg',
        content: String(entity.spec.ansible_cfg),
      });
    }

    if (entity.spec.mcp_vars) {
      rawdata.push({
        name: 'mcp-vars.yaml',
        content: String(entity.spec.mcp_vars),
      });
    }

    const tarData = createTarArchive(rawdata);
    const blob = new Blob([tarData as BlobPart], {
      type: 'application/x-tar',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = archiveName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
