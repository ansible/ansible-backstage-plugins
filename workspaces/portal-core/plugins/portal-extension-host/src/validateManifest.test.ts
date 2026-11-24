import { validateManifest } from './validateManifest';
import type { ManifestValidationResult } from './validateManifest';
import type {
  PluginManifest,
  CapabilityContribution,
} from '@ansible/portal-extension-api';

// ── Helpers ───────────────────────────────────────────────────────────────────

const HOST_VERSION = '0.1.0';

const makeManifest = (
  overrides: Partial<PluginManifest> = {},
): PluginManifest => ({
  id: 'test-plugin',
  version: '0.1.0',
  apiVersion: '0.1.0',
  capabilities: [],
  entitlements: [],
  ...overrides,
});

const makeCapability = (
  overrides: Partial<CapabilityContribution> = {},
): CapabilityContribution => ({
  id: 'test-capability',
  ownerPlugin: 'test-plugin',
  displayName: 'Test Capability',
  description: 'A test capability',
  appliesToContentTypes: '*',
  entryPoints: [],
  minimumHostApiVersion: '0.1.0',
  ...overrides,
});

// ── validateManifest — core cases ─────────────────────────────────────────────

describe('validateManifest', () => {
  describe('API version compatibility (pre-1.0.0)', () => {
    it('accepts a manifest whose apiVersion matches the host exactly', () => {
      const result = validateManifest(
        makeManifest({ apiVersion: '0.1.0' }),
        '0.1.0',
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects a manifest with a different minor version (pre-1.0.0 policy)', () => {
      const result = validateManifest(
        makeManifest({ apiVersion: '0.2.0' }),
        '0.1.0',
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/incompatible/i);
    });

    it('rejects a manifest with a different major version', () => {
      const result = validateManifest(
        makeManifest({ apiVersion: '1.0.0' }),
        '0.1.0',
      );
      expect(result.valid).toBe(false);
    });

    it('returns empty validCapabilities on fatal API version mismatch', () => {
      const result = validateManifest(
        makeManifest({
          apiVersion: '0.2.0',
          capabilities: [makeCapability()],
        }),
        '0.1.0',
      );
      expect(result.validCapabilities).toHaveLength(0);
    });

    it('allows patch version difference when major and minor match (pre-1.0.0)', () => {
      const result = validateManifest(
        makeManifest({ apiVersion: '0.1.3' }),
        '0.1.0',
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('API version compatibility (post-1.0.0)', () => {
    it('accepts matching major version in post-1.0.0 mode', () => {
      const result = validateManifest(
        makeManifest({ apiVersion: '1.2.0' }),
        '1.5.0',
      );
      expect(result.valid).toBe(true);
    });

    it('rejects different major version in post-1.0.0 mode', () => {
      const result = validateManifest(
        makeManifest({ apiVersion: '2.0.0' }),
        '1.5.0',
      );
      expect(result.valid).toBe(false);
    });

    it('allows minor version difference in post-1.0.0 mode', () => {
      const result = validateManifest(
        makeManifest({ apiVersion: '1.0.0' }),
        '1.5.0',
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('empty capabilities', () => {
    it('returns valid with empty validCapabilities when the manifest has no capabilities', () => {
      const result = validateManifest(
        makeManifest({ capabilities: [] }),
        HOST_VERSION,
      );
      expect(result.valid).toBe(true);
      expect(result.validCapabilities).toHaveLength(0);
    });
  });

  describe('host-owned placement', () => {
    it('accepts a capability without experience metadata', () => {
      const capability = makeCapability();
      const result = validateManifest(
        makeManifest({ capabilities: [capability] }),
        HOST_VERSION,
      );
      expect(result.valid).toBe(true);
      expect(result.validCapabilities).toEqual([capability]);
    });

    it('ignores obsolete experience metadata in existing serialized manifests', () => {
      const capability = {
        ...makeCapability(),
        experienceId: 'retired-host-group',
      };
      const result = validateManifest(
        makeManifest({ capabilities: [capability] }),
        HOST_VERSION,
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.validCapabilities).toEqual([capability]);
    });

    it('still rejects unsupported capabilities alongside valid ones', () => {
      const result = validateManifest(
        makeManifest({
          capabilities: [
            makeCapability({ id: 'supported' }),
            makeCapability({
              id: 'unsupported',
              minimumHostApiVersion: '9.0.0',
            }),
          ],
        }),
        HOST_VERSION,
      );
      expect(result.valid).toBe(false);
      expect(result.validCapabilities.map(capability => capability.id)).toEqual(
        ['supported'],
      );
    });
  });

  describe('per-capability: minimumHostApiVersion', () => {
    it('accepts a capability whose minimumHostApiVersion equals the host version', () => {
      const result = validateManifest(
        makeManifest({
          capabilities: [makeCapability({ minimumHostApiVersion: '0.1.0' })],
        }),
        '0.1.0',
      );
      expect(result.valid).toBe(true);
    });

    it('accepts a capability whose minimumHostApiVersion is lower than the host', () => {
      const result = validateManifest(
        makeManifest({
          capabilities: [makeCapability({ minimumHostApiVersion: '0.1.0' })],
        }),
        '0.1.5',
      );
      expect(result.valid).toBe(true);
    });

    it('rejects a capability that requires a newer host than current', () => {
      const result = validateManifest(
        makeManifest({
          capabilities: [makeCapability({ minimumHostApiVersion: '0.2.0' })],
        }),
        '0.1.0',
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/requires host apiVersion/i);
    });
  });

  describe('multiple capabilities — mixed valid/invalid', () => {
    it('collects errors from multiple invalid capabilities', () => {
      const result = validateManifest(
        makeManifest({
          capabilities: [
            makeCapability({
              id: 'bad-major',
              minimumHostApiVersion: '1.0.0',
            }),
            makeCapability({ id: 'bad-ver', minimumHostApiVersion: '9.9.9' }),
          ],
        }),
        HOST_VERSION,
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.validCapabilities).toHaveLength(0);
    });
  });

  describe('return type shape', () => {
    it('always returns valid, errors, and validCapabilities', () => {
      const result: ManifestValidationResult = validateManifest(
        makeManifest(),
        HOST_VERSION,
      );
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.validCapabilities)).toBe(true);
    });
  });
});
