import {
  ArchiveContentTypeAdapter,
  assertMetadataDocument,
  validateNormalizedMetadata,
} from '@ansible/automation-content-common';
import type { ArchiveItem } from '@ansible/automation-content-common';

/** Local Utopia fixture convention for AAP-94357 research; replace when standardized Ansible artifact types exist. */
export const COLLECTION_ARTIFACT_TYPE =
  'application/vnd.ansible.fixture.collection.v1+json';

/** Enumerates collection metadata, not undocumented plugins inferred from filenames. */
export class AnsibleCollectionAdapter extends ArchiveContentTypeAdapter {
  readonly type = 'collection';
  readonly mediaTypes = [COLLECTION_ARTIFACT_TYPE];
  readonly filename = 'MANIFEST.json';

  parse(document: string): ArchiveItem[] {
    assertMetadataDocument(document);
    const parsed: unknown = JSON.parse(document);
    validateNormalizedMetadata(parsed);
    if (!parsed || typeof parsed !== 'object' || !('collection_info' in parsed))
      throw new Error('MANIFEST.json has no collection_info');
    const info = parsed.collection_info;
    if (!info || typeof info !== 'object' || Array.isArray(info))
      throw new Error('collection_info must be a mapping');
    const detail = info as Record<string, unknown>;
    for (const field of ['namespace', 'name', 'version']) {
      if (
        typeof detail[field] !== 'string' ||
        !(detail[field] as string).trim()
      )
        throw new Error(`collection_info requires ${field}`);
    }
    return [
      {
        fqcn: `${detail.namespace}.${detail.name}`,
        name: detail.name as string,
        version: detail.version as string,
        type: this.type,
        description:
          typeof detail.description === 'string'
            ? detail.description
            : undefined,
        detail,
      },
    ];
  }
}
