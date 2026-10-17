/**
 * The Ansible content manifest — the build-time artifact that makes cheap, exact
 * content discovery possible.
 *
 * Why it exists: determining what is inside an execution environment by inspecting it
 * afterwards is both slow and semantically unreliable. An EE ships a specific
 * ansible-core, and its collections are authored against that version; extracting
 * documentation from outside with a *different* core can silently produce wrong
 * results, because plugin loading, argument-spec handling and documentation-fragment
 * resolution all vary between versions.
 *
 * Generating it during the build, inside the image, with the image's own core, is
 * correct by construction. Everything else is an approximation.
 *
 * It is also where the cost belongs. A full manifest for a five-collection network EE
 * — 116 modules, 41 filters, 25 tests, 19 EDA plugins — takes a few seconds to produce
 * once, at build time. Deferring it to consumers means paying it per catalog render,
 * forever.
 *
 * Distribution: written into the image at `/usr/share/ansible/content-manifest.json`,
 * and pushed alongside it as an OCI referrer whose `subject` is the image manifest, so
 * a consumer reads it in about two HTTP calls instead of pulling gigabytes.
 *
 * This mirrors the schema emitted by `content_manifest.py` in ansible-builder.
 */

export const CONTENT_MANIFEST_SCHEMA_VERSION = '1.0.0';

/** OCI artifactType of the referrer carrying this manifest. */
export const CONTENT_MANIFEST_ARTIFACT_TYPE =
  'application/vnd.ansible.content-manifest.v1+json';

/** Media type of the manifest layer blob. */
export const CONTENT_MANIFEST_LAYER_MEDIA_TYPE =
  'application/vnd.ansible.content-manifest.v1+json';

/**
 * OCI image labels carrying a summary of the manifest.
 *
 * Labels are the fallback when a registry cannot serve referrers. They hold a summary
 * only — label space is limited and some registries truncate — so the full document
 * always lives in the referrer and in the image.
 */
export const ContentManifestLabels = {
  present: 'io.ansible.content.manifest',
  schemaVersion: 'io.ansible.content.manifest.schema',
  path: 'io.ansible.content.manifest.path',
  /** Comma-separated `namespace.name:version`, for listing without a fetch. */
  collections: 'io.ansible.content.collections',
  collectionCount: 'io.ansible.content.collections.count',
  ansibleCore: 'io.ansible.content.ansible_core',
  generatedBy: 'io.ansible.content.generated_by',
  generatedAt: 'io.ansible.content.generated_at',
} as const;

/** How much documentation the generator embedded. */
export type DocsMode = 'full' | 'summary' | 'none';

/** Where documentation came from — determines fidelity. */
export type DocsSource = 'ansible-doc' | 'filesystem';

/**
 * An argument specification.
 *
 * Recursive: network resource modules nest options several levels deep, and that
 * nesting is precisely the detail that makes them worth documenting.
 */
export interface ManifestOption {
  type?: string;
  elements?: string;
  required?: boolean;
  default?: unknown;
  choices?: unknown[];
  aliases?: string[];
  versionAdded?: string;
  description?: string[];
  suboptions?: Record<string, ManifestOption>;
}

export interface ManifestPluginEntry {
  name: string;
  /** 'module' | 'filter' | 'lookup' | 'test' | 'connection' | 'cliconf' | … */
  type: string;
  /** Fully qualified collection name, e.g. `cisco.ios.ios_vlans`. */
  fqcn: string;
  shortDescription?: string;
  description?: string[];
  versionAdded?: string;
  author?: string[];
  notes?: string[];
  requirements?: string[];
  options?: Record<string, ManifestOption>;
  examples?: string;
  returns?: Record<string, unknown>;
  deprecated?: boolean;
  deprecation?: unknown;
  /**
   * Present when documentation extraction failed for this plugin. The plugin is still
   * listed — it exists in the image regardless of whether it could be documented.
   */
  extractionError?: string;
}

export interface ManifestRoleEntryPointSpec {
  shortDescription?: string;
  description?: string[] | null;
  options?: Record<string, ManifestOption>;
}

export interface ManifestRoleEntry {
  name: string;
  fqcn: string;
  /** From argument_specs.yml, or `['main']` when inferred. */
  entryPoints: string[];
  /** True when no argument_specs.yml existed and structure was inferred. */
  inferred: boolean;
  description?: string;
  entryPointSpecs?: Record<string, ManifestRoleEntryPointSpec>;
}

/**
 * A playbook shipped inside a collection.
 *
 * Name only. No documentation convention for collection playbooks is standardised, and
 * header comments are too inconsistent to parse reliably — a guessed description would
 * be confidently wrong, which is worse than none.
 */
export interface ManifestPlaybookEntry {
  name: string;
  fqcn: string;
}

/** An Event-Driven Ansible plugin from `extensions/eda/plugins/`. */
export interface ManifestEdaPluginEntry {
  name: string;
  type: 'event_source' | 'event_filter';
  fqcn: string;
  shortDescription?: string;
  description?: string[];
  options?: Record<string, ManifestOption>;
  examples?: string;
}

export interface ManifestRulebookEntry {
  name: string;
  path: string;
}

export interface ManifestCollectionEntry {
  namespace: string;
  name: string;
  version: string;
  description?: string;
  authors?: string[];
  repository?: string;
  documentation?: string;
  license?: string[];
  tags?: string[];
  /** Declared collection dependencies: name → version spec. */
  dependencies?: Record<string, string>;
  plugins: ManifestPluginEntry[];
  roles: ManifestRoleEntry[];
  playbooks: ManifestPlaybookEntry[];
  edaPlugins: ManifestEdaPluginEntry[];
  rulebooks: ManifestRulebookEntry[];
}

export interface ManifestGenerator {
  tool: string;
  version: string;
  /** The ansible-core that performed enumeration. The fidelity guarantee. */
  ansibleCore?: string;
  pythonVersion?: string;
  docsMode?: DocsMode;
  docsSource?: DocsSource;
}

export interface ManifestEnvironment {
  pythonPackages?: Record<string, string>;
  systemPackages?: string[];
  baseImage?: string;
}

/** Recorded rather than hidden — partial enumeration must stay visible downstream. */
export interface ManifestDiagnostic {
  level: 'info' | 'warning' | 'error';
  message: string;
  collection?: string;
}

export interface AnsibleContentManifest {
  schemaVersion: string;
  generatedAt: string;
  generatedBy: ManifestGenerator;
  collections: ManifestCollectionEntry[];
  environment?: ManifestEnvironment;
  diagnostics?: ManifestDiagnostic[];
  /** True when documentation came from ansible-doc and no collection errored. */
  complete: boolean;
}

/** Narrow an unknown payload to a content manifest, without trusting its contents. */
export function isContentManifest(
  value: unknown,
): value is AnsibleContentManifest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<AnsibleContentManifest>;
  return (
    typeof candidate.schemaVersion === 'string' &&
    Array.isArray(candidate.collections) &&
    // Collection entries are dereferenced by every consumer; each must be an
    // object carrying the identity fields the model keys on. Item arrays are
    // deliberately not required here — `normaliseContentManifest` defaults
    // them, so a publisher may omit empty ones.
    candidate.collections.every(
      c =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as { namespace?: unknown }).namespace === 'string' &&
        typeof (c as { name?: unknown }).name === 'string' &&
        typeof (c as { version?: unknown }).version === 'string',
    ) &&
    typeof candidate.generatedBy === 'object' &&
    candidate.generatedBy !== null
  );
}

/**
 * Default every collection's item arrays, so consumers can rely on the
 * declared shape even when a publisher omitted empty arrays.
 *
 * The payload arrives as an untrusted referrer blob; `isContentManifest`
 * checks only the fields consumers branch on, so normalisation happens here
 * at the read boundary rather than as `?? []` in every consumer.
 */
export function normaliseContentManifest(
  manifest: AnsibleContentManifest,
): AnsibleContentManifest {
  return {
    ...manifest,
    collections: manifest.collections.map(collection => ({
      ...collection,
      plugins: collection.plugins ?? [],
      roles: collection.roles ?? [],
      playbooks: collection.playbooks ?? [],
      edaPlugins: collection.edaPlugins ?? [],
      rulebooks: collection.rulebooks ?? [],
    })),
  };
}

/** Counts for display and for cheap comparison between manifest versions. */
export interface ManifestSummary {
  collections: number;
  plugins: number;
  pluginsByType: Record<string, number>;
  roles: number;
  playbooks: number;
  edaPlugins: number;
  rulebooks: number;
}

export function summariseManifest(
  manifest: AnsibleContentManifest,
): ManifestSummary {
  const summary: ManifestSummary = {
    collections: manifest.collections.length,
    plugins: 0,
    pluginsByType: {},
    roles: 0,
    playbooks: 0,
    edaPlugins: 0,
    rulebooks: 0,
  };

  for (const collection of manifest.collections) {
    for (const plugin of collection.plugins) {
      summary.plugins += 1;
      summary.pluginsByType[plugin.type] =
        (summary.pluginsByType[plugin.type] ?? 0) + 1;
    }
    summary.roles += collection.roles?.length ?? 0;
    summary.playbooks += collection.playbooks?.length ?? 0;
    summary.edaPlugins += collection.edaPlugins?.length ?? 0;
    summary.rulebooks += collection.rulebooks?.length ?? 0;
  }
  return summary;
}

/**
 * Parse the summary label into collection references.
 *
 * Format: `namespace.name:version,namespace.name:version`. Malformed entries are
 * skipped rather than throwing — a bad label should degrade a listing, not fail a sync.
 */
export function parseCollectionsLabel(
  label: string | undefined,
): Array<{ namespace: string; name: string; version: string }> {
  if (!label) return [];
  const out: Array<{ namespace: string; name: string; version: string }> = [];
  for (const entry of label.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const [fqcn, version] = trimmed.split(':');
    const dot = fqcn?.indexOf('.') ?? -1;
    if (dot <= 0 || !version) continue;
    out.push({
      namespace: fqcn.slice(0, dot),
      name: fqcn.slice(dot + 1),
      version,
    });
  }
  return out;
}
