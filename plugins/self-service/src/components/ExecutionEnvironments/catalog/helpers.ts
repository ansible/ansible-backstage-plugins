import { Entity, ANNOTATION_EDIT_URL } from '@backstage/catalog-model';
import { createTarArchive } from '../../utils/tarArchiveUtils';

const SCM_PROVIDER_ANNOTATION = 'ansible.io/scm-provider';
const SOURCE_LOCATION_ANNOTATION = 'backstage.io/source-location';

function parseAnnotatedSourceLocation(rawLocation: string): URL | null {
  const cleanUrl = rawLocation.replace(/^url:/i, '').replace(/\/$/, '').trim();
  try {
    return new URL(cleanUrl);
  } catch {
    return null;
  }
}

/** Index of `tree` or `blob` in path segments, or -1 if neither. */
function indexOfTreeOrBlob(parts: string[]): number {
  const treeIdx = parts.indexOf('tree');
  if (treeIdx >= 0) {
    return treeIdx;
  }
  const blobIdx = parts.indexOf('blob');
  return blobIdx >= 0 ? blobIdx : -1;
}

function githubRepoBaseUrl(origin: string, parts: string[]): string | null {
  const markerIdx = indexOfTreeOrBlob(parts);
  const cut = markerIdx >= 0 ? markerIdx : Math.min(2, parts.length);
  const segs = parts.slice(0, cut);
  if (segs.length < 2) {
    return null;
  }
  return `${origin}/${segs[0]}/${segs[1]}`;
}

function gitlabTreeOrBlobStartIndex(parts: string[]): number {
  for (let i = 0; i < parts.length - 1; i++) {
    if (
      parts[i] === '-' &&
      (parts[i + 1] === 'tree' || parts[i + 1] === 'blob')
    ) {
      return i;
    }
  }
  return -1;
}

function gitlabRepoBaseUrl(origin: string, parts: string[]): string | null {
  const dashIdx = gitlabTreeOrBlobStartIndex(parts);
  if (dashIdx >= 0) {
    const segs = parts.slice(0, dashIdx);
    if (segs.length < 2) {
      return null;
    }
    return `${origin}/${segs.join('/')}`;
  }

  const markerIdx = indexOfTreeOrBlob(parts);
  const segs = markerIdx >= 0 ? parts.slice(0, markerIdx) : parts;
  if (segs.length < 2) {
    return null;
  }
  return `${origin}/${segs.join('/')}`;
}

/**
 * Returns a repository base URL for ScmAuth (e.g. https://github.com/org/repo),
 * or null if the entity is not linked to GitHub/GitLab SCM.
 */
export function getScmRepoUrlForAuth(entity: Entity): string | null {
  const rawLocation =
    entity?.metadata?.annotations?.[SOURCE_LOCATION_ANNOTATION];
  const scmRaw = entity?.metadata?.annotations?.[SCM_PROVIDER_ANNOTATION];
  if (!rawLocation || !scmRaw) {
    return null;
  }

  const parsed = parseAnnotatedSourceLocation(rawLocation);
  if (!parsed) {
    return null;
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  const scm = scmRaw.toLowerCase();
  if (scm.includes('github')) {
    return githubRepoBaseUrl(parsed.origin, parts);
  }
  if (scm.includes('gitlab')) {
    return gitlabRepoBaseUrl(parsed.origin, parts);
  }
  return null;
}

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
