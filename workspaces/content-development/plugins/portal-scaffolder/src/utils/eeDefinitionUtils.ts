import yaml from 'js-yaml';

/**
 * Parses EE definition YAML string to extract fields for Defined Content and About card.
 * Uses js-yaml for safe, structured parsing of the ansible-builder schema.
 * Supports both inline lists and file references (e.g. galaxy: requirements.yaml).
 */
export interface ParsedEEDefinition {
  baseImageName: string | null;
  collections: Array<{ name: string; version?: string; type?: string }>;
  pythonPath: string | null;
  /** Python requirements (pip packages) from dependencies.python */
  pythonPackages: string[] | null;
  /** When dependencies.python is a file reference (e.g. requirements.txt) */
  pythonFileRef: string | null;
  systemPackages: string[] | null;
  /** When dependencies.system is a file reference (e.g. bindep.txt) */
  systemFileRef: string | null;
  /** When dependencies.galaxy is a file reference (e.g. requirements.txt) */
  collectionsFileRef: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  return null;
}

function extractBaseImageName(doc: Record<string, unknown>): string | null {
  const images = doc.images;
  if (!isRecord(images)) return null;
  const baseImage = images.base_image;
  if (!isRecord(baseImage)) return null;
  return asString(baseImage.name);
}

function extractPythonPath(deps: Record<string, unknown>): string | null {
  const interp = deps.python_interpreter;
  if (!isRecord(interp)) return null;
  return asString(interp.python_path);
}

function extractStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value
    .map(v => (typeof v === 'string' ? v.trim() : null))
    .filter((v): v is string => v !== null && v.length > 0);
  return items.length > 0 ? items : null;
}

function extractCollections(
  galaxy: unknown,
): Array<{ name: string; version?: string; type?: string }> {
  if (!isRecord(galaxy)) return [];
  const collections = galaxy.collections;
  if (!Array.isArray(collections)) return [];
  return collections
    .filter(isRecord)
    .filter(item => typeof item.name === 'string')
    .map(item => {
      const entry: { name: string; version?: string; type?: string } = {
        name: (item.name as string).trim(),
      };
      const ver = asString(item.version);
      if (ver) entry.version = ver;
      const typ = asString(item.type);
      if (typ) entry.type = typ;
      return entry;
    });
}

/** Max length for definition YAML to bound parse time. */
const MAX_DEFINITION_LENGTH = 100_000;

function parsePythonDeps(
  python: unknown,
): Pick<ParsedEEDefinition, 'pythonPackages' | 'pythonFileRef'> {
  if (Array.isArray(python)) {
    return { pythonPackages: extractStringList(python), pythonFileRef: null };
  }
  if (typeof python === 'string' && /\.(?:txt|in)$/.test(python)) {
    return { pythonPackages: null, pythonFileRef: python.trim() };
  }
  return { pythonPackages: null, pythonFileRef: null };
}

function parseSystemDeps(
  system: unknown,
): Pick<ParsedEEDefinition, 'systemPackages' | 'systemFileRef'> {
  if (Array.isArray(system)) {
    return { systemPackages: extractStringList(system), systemFileRef: null };
  }
  if (isRecord(system) && Array.isArray(system.packages)) {
    return {
      systemPackages: extractStringList(system.packages),
      systemFileRef: null,
    };
  }
  if (typeof system === 'string' && /\.(?:txt|in)$/.test(system)) {
    return { systemPackages: null, systemFileRef: system.trim() };
  }
  return { systemPackages: null, systemFileRef: null };
}

function parseGalaxyDeps(
  galaxy: unknown,
): Pick<ParsedEEDefinition, 'collections' | 'collectionsFileRef'> {
  if (isRecord(galaxy)) {
    return {
      collections: extractCollections(galaxy),
      collectionsFileRef: null,
    };
  }
  if (typeof galaxy === 'string' && /\.ya?ml$/.test(galaxy)) {
    return { collections: [], collectionsFileRef: galaxy.trim() };
  }
  return { collections: [], collectionsFileRef: null };
}

/**
 * Parse EE definition YAML content.
 * Returns null if definition is empty or invalid.
 */
export function parseEEDefinition(
  definitionYaml: string | undefined,
): ParsedEEDefinition | null {
  if (!definitionYaml || typeof definitionYaml !== 'string') return null;
  if (definitionYaml.length > MAX_DEFINITION_LENGTH) return null;

  try {
    const doc = yaml.load(definitionYaml);
    if (!isRecord(doc)) return null;

    const deps = doc.dependencies;
    const depsRecord = isRecord(deps) ? deps : undefined;

    return {
      baseImageName: extractBaseImageName(doc),
      pythonPath: depsRecord ? extractPythonPath(depsRecord) : null,
      ...parsePythonDeps(depsRecord?.python),
      ...parseSystemDeps(depsRecord?.system),
      ...parseGalaxyDeps(depsRecord?.galaxy),
    };
  } catch {
    return null;
  }
}
