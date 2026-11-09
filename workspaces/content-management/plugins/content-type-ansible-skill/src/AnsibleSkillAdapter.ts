import { parseDocument } from 'yaml';
import {
  ArchiveContentTypeAdapter,
  assertMetadataDocument,
  validateNormalizedMetadata,
} from '@ansible/automation-content-common';
import type { ArchiveItem } from '@ansible/automation-content-common';

/** Local Utopia fixture convention for AAP-94357 research; replace when standardized Ansible artifact types exist. */
export const SKILL_ARTIFACT_TYPE =
  'application/vnd.ansible.fixture.skill.v1+json';

/** Recognises skill artifacts and enumerates their root SKILL.md frontmatter. */
export class AnsibleSkillAdapter extends ArchiveContentTypeAdapter {
  readonly type = 'skill';
  readonly mediaTypes = [SKILL_ARTIFACT_TYPE];
  readonly filename = 'SKILL.md';

  parse(document: string): ArchiveItem[] {
    assertMetadataDocument(document);
    const lines = document.replace(/^\uFEFF/, '').split(/\r?\n/);
    if (lines[0] !== '---') throw new Error('SKILL.md has no YAML frontmatter');
    const end = lines.indexOf('---', 1);
    if (end < 0) throw new Error('SKILL.md frontmatter is not closed');
    const yaml = parseDocument(lines.slice(1, end).join('\n'));
    if (yaml.errors.length)
      throw new Error('SKILL.md frontmatter is invalid YAML');
    const detail: unknown = yaml.toJS({ maxAliasCount: 0 });
    validateNormalizedMetadata(detail);
    if (!detail || typeof detail !== 'object' || Array.isArray(detail))
      throw new Error('SKILL.md frontmatter must be a mapping');
    const metadata = detail as Record<string, unknown>;
    if (typeof metadata.name !== 'string' || !metadata.name.trim())
      throw new Error('SKILL.md requires a name');
    if (typeof metadata.description !== 'string')
      throw new Error('SKILL.md requires a description');
    return [
      {
        fqcn: metadata.name,
        name: metadata.name,
        type: this.type,
        description: metadata.description,
        version:
          typeof metadata.version === 'string' ? metadata.version : undefined,
        detail: metadata,
      },
    ];
  }
}
