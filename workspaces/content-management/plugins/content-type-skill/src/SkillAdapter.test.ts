import type {
  MetadataBundle,
  ResolvedArtifact,
} from '@ansible/automation-content-common';
import { SKILL_LABEL, SkillAdapter } from './SkillAdapter';

const adapter = new SkillAdapter();

const ref = {
  registry: 'mock',
  repository: 'demo/skills/cluster-triage',
  reference: '1.0.0',
  digest: `sha256:${'ef'.repeat(32)}`,
  mediaType: 'application/vnd.oci.image.manifest.v1+json',
  manifest: { schemaVersion: 2 },
} as ResolvedArtifact;

const meta = (over: Partial<MetadataBundle> = {}): MetadataBundle => ({
  manifest: { schemaVersion: 2 } as any,
  obtained: ['manifest'],
  ...over,
});

const labelled = (labels: Record<string, string>) =>
  meta({ config: { config: { Labels: labels } } as any });

describe('identify', () => {
  it('recognises the skill label', () => {
    const result = adapter.identify(ref, labelled({ [SKILL_LABEL]: 'true' }));
    expect(result.confidence).toBe('certain');
    expect(result.signals).toContain(`label ${SKILL_LABEL}=true`);
  });

  it('declines an ordinary image, and says why', () => {
    const result = adapter.identify(ref, labelled({ maintainer: 'someone' }));
    expect(result.confidence).toBe('no');
    expect(result.signals.join(' ')).toContain(SKILL_LABEL);
  });

  it('does not claim an execution environment or collection', () => {
    expect(
      adapter.identify(
        ref,
        labelled({
          'ansible-execution-environment': 'true',
          'ansible-collection': 'true',
        }),
      ).confidence,
    ).toBe('no');
  });

  it('costs no extra requests', () => {
    const bundle = labelled({ [SKILL_LABEL]: 'true' });
    expect(bundle.obtained).toEqual(['manifest']);
    expect(adapter.identify(ref, bundle).confidence).toBe('certain');
  });
});

describe('normalize', () => {
  it('builds a content object typed as a skill', async () => {
    const object = await adapter.normalize(ref, labelled({}));
    expect(object.identity.type).toBe('skill');
    expect(object.identity.namespace).toBe('demo');
    expect(object.identity.name).toBe('skills/cluster-triage');
    expect(object.version.tags).toEqual(['1.0.0']);
    expect(object.trust.signing).toEqual({ signed: false, verified: false });
  });
});

describe('enumerate', () => {
  it('returns unknown, never empty, when the contents are not enumerated', async () => {
    const result = await adapter.enumerate(ref, {
      backend: {} as any,
      capabilities: {} as any,
    });
    expect(result.status).toBe('unknown');
    expect(result.collections).toBeUndefined();
  });
});
