import {
  type PluginManifest,
  type CapabilityContribution,
  EXPERIENCE_IDS,
} from '@ansible/portal-extension-api';

// ── Semver helpers ────────────────────────────────────────────────────────────

interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

function parseSemVer(version: string): SemVer | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Returns true when `pluginApiVersion` is compatible with `hostApiVersion`.
 *
 * Compatibility rules (matching the architecture doc semver policy):
 * - **Pre-1.0.0** (major === 0): both major and minor must match, since minor
 *   bumps may include breaking changes.
 * - **Post-1.0.0**: only major must match (additive-only minor changes).
 */
function isApiVersionCompatible(
  pluginApiVersion: string,
  hostApiVersion: string,
): boolean {
  const plugin = parseSemVer(pluginApiVersion);
  const host = parseSemVer(hostApiVersion);
  if (!plugin || !host) return false;
  if (plugin.major !== host.major) return false;
  // Pre-1.0.0: minor must also match (breaking changes allowed in minors).
  if (host.major === 0 && plugin.minor !== host.minor) return false;
  return true;
}

/**
 * Returns true when `minimumHostApiVersion` is satisfied by the actual
 * `hostApiVersion` — i.e., the host is at least as new as the capability
 * requires.
 */
function isCapabilitySupported(
  minimumHostApiVersion: string,
  hostApiVersion: string,
): boolean {
  const min = parseSemVer(minimumHostApiVersion);
  const host = parseSemVer(hostApiVersion);
  if (!min || !host) return false;
  if (host.major > min.major) return true;
  if (host.major < min.major) return false;
  if (host.minor > min.minor) return true;
  if (host.minor < min.minor) return false;
  return host.patch >= min.patch;
}

// ── Known experience IDs ──────────────────────────────────────────────────────

const KNOWN_EXPERIENCE_IDS = new Set<string>(Object.values(EXPERIENCE_IDS));

// ── Validation result ─────────────────────────────────────────────────────────

export interface ManifestValidationResult {
  valid: boolean;
  /** Human-readable error messages. Empty when `valid` is true. */
  errors: string[];
  /**
   * Capabilities that passed all checks. The host should only activate these.
   * Capabilities that fail validation are excluded from this list.
   */
  validCapabilities: CapabilityContribution[];
}

// ── Main validator ────────────────────────────────────────────────────────────

/**
 * Validates a plugin manifest before the host activates it.
 *
 * The host calls this once per plugin load. An invalid manifest fails
 * locally — it does not prevent the portal from starting. The host logs
 * errors from this result and skips incompatible capabilities.
 *
 * Checks performed:
 * 1. `apiVersion` is compatible with the host's current contract version.
 * 2. All `experienceId` values reference experiences the host has declared.
 * 3. Each capability's `minimumHostApiVersion` is satisfied by the host.
 *
 * @param manifest - The plugin's published manifest.
 * @param hostApiVersion - The host's current contract version (semver string).
 *
 * @example
 * ```ts
 * const result = validateManifest(pluginManifest, '0.1.0');
 * if (!result.valid) {
 *   console.error('[Host] Manifest invalid:', result.errors);
 *   return; // skip activation
 * }
 * // Only activate result.validCapabilities
 * ```
 */
export function validateManifest(
  manifest: PluginManifest,
  hostApiVersion: string,
): ManifestValidationResult {
  const errors: string[] = [];

  // 1. Plugin-level API version compatibility.
  if (!isApiVersionCompatible(manifest.apiVersion, hostApiVersion)) {
    errors.push(
      `Plugin "${manifest.id}" apiVersion "${manifest.apiVersion}" is incompatible ` +
        `with host apiVersion "${hostApiVersion}". ${
          parseSemVer(hostApiVersion)?.major === 0
            ? 'Pre-1.0.0: major and minor must match.'
            : 'Post-1.0.0: major version must match.'
        }`,
    );
    // API version mismatch is fatal — do not validate capabilities.
    return { valid: false, errors, validCapabilities: [] };
  }

  // 2. Per-capability checks.
  const validCapabilities: CapabilityContribution[] = [];

  for (const capability of manifest.capabilities) {
    const capErrors: string[] = [];

    // 2a. experienceId must be known.
    if (!KNOWN_EXPERIENCE_IDS.has(capability.experienceId)) {
      capErrors.push(
        `Capability "${capability.id}" references unknown experienceId ` +
          `"${capability.experienceId}". ` +
          `Known IDs: ${[...KNOWN_EXPERIENCE_IDS].join(', ')}.`,
      );
    }

    // 2b. minimumHostApiVersion must be satisfied.
    if (
      !isCapabilitySupported(capability.minimumHostApiVersion, hostApiVersion)
    ) {
      capErrors.push(
        `Capability "${capability.id}" requires host apiVersion ` +
          `">= ${capability.minimumHostApiVersion}" but host is at ` +
          `"${hostApiVersion}".`,
      );
    }

    if (capErrors.length > 0) {
      errors.push(...capErrors);
    } else {
      validCapabilities.push(capability);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    validCapabilities,
  };
}
