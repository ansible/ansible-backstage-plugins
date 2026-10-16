import { useEffect } from 'react';
import {
  contributionRegistry,
  type PluginManifest,
} from '@ansible/portal-extension-api';
import { validateManifest } from './validateManifest';

interface DynamicExtensionDiscoveryProps {
  /**
   * First-party manifests to validate immediately on mount (e.g.
   * `selfServiceManifest`). These are validated once before any third-party
   * plugin has had a chance to register.
   *
   * Defaults to `[]`.
   */
  manifests?: PluginManifest[];
  /**
   * The host's current contract API version. Defaults to `'0.1.0'`.
   */
  hostApiVersion?: string;
}

/**
 * Side-effect component that validates plugin manifests as they arrive.
 *
 * **First-party manifests** (passed via the `manifests` prop) are validated
 * once on mount. This covers the host plugin's own capabilities and proves
 * the manifest pipeline works end-to-end.
 *
 * **Third-party manifests** are discovered via the `ContributionRegistry`
 * subscription. When an external plugin calls `registerManifest(manifest)`
 * from its `dynamic/index.ts`, this component receives and validates it
 * immediately. The subscription replays any manifests that were registered
 * before this component mounted — so load order does not matter.
 *
 * **What validation produces today:** logged output only. Full slot-based
 * activation (translating validated `CapabilityEntryPoints` into mounted
 * components) is deferred to Phase 6, pending the NFS mount-point design.
 *
 * **Why a React component?**
 * The registry subscription must be cleaned up on unmount to avoid memory
 * leaks and stale callbacks in tests. `useEffect` gives us that lifecycle
 * for free.
 */
export const DynamicExtensionDiscovery = ({
  manifests = [],
  hostApiVersion = '0.1.0',
}: DynamicExtensionDiscoveryProps = {}) => {
  // ── First-party manifests ─────────────────────────────────────────────────
  useEffect(() => {
    for (const manifest of manifests) {
      validateAndLog(manifest, hostApiVersion);
    }
  }, [manifests, hostApiVersion]);

  // ── Third-party manifests (registry subscription) ─────────────────────────
  useEffect(() => {
    // subscribeToManifests replays already-registered manifests immediately,
    // then fires for each future registerManifest() call.
    const unsubscribe = contributionRegistry.subscribeToManifests(manifest => {
      validateAndLog(manifest, hostApiVersion);
    });
    return unsubscribe;
  }, [hostApiVersion]);

  return null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateAndLog(
  manifest: PluginManifest,
  hostApiVersion: string,
): void {
  const result = validateManifest(manifest, hostApiVersion);
  if (!result.valid) {
    // eslint-disable-next-line no-console
    console.error(
      `[DynamicExtensionDiscovery] Manifest "${manifest.id}" validation failed:`,
      result.errors,
    );
  } else {
    // eslint-disable-next-line no-console
    console.info(
      `[DynamicExtensionDiscovery] Manifest "${manifest.id}" validated: ` +
        `${result.validCapabilities.length} capabilities declared.`,
    );
  }
}

/**
 * Returns true when the portal is running in an RHDH dynamic plugin
 * environment (NFS module federation active).
 *
 * Currently returns false in standard Backstage since there is no
 * detectable global marker in NFS as there was with Scalprum's
 * `window.__scalprum`. Use the presence of registered third-party manifests
 * (`contributionRegistry.getManifests().length > 0`) as a proxy if needed.
 */
export function useIsDynamicEnvironment(): boolean {
  // NFS (RHDH 2.1+) does not inject a detectable global.
  // Scalprum's window.__scalprum is no longer present.
  return false;
}

// Keep the registry accessible for any module that imports this file.
export { contributionRegistry };
