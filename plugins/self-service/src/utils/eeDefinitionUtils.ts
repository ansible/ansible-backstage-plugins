/**
 * Parses EE definition YAML string to extract fields for Defined Content and About card.
 * Uses simple parsing to avoid extra dependencies; handles common ansible-builder schema.
 * Supports both inline lists and file references (e.g. galaxy: requirements.yaml).
 */
export interface ParsedEEDefinition {
  baseImageName: string | null;
  collections: Array<{ name: string; version?: string }>;
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

function parseBaseImageName(yaml: string): string | null {
  const m =
    /images:\s*\n\s*base_image:\s*\n\s*name:\s*['"]?([^'"\n]+)['"]?/.exec(yaml);
  return m ? m[1].trim() : null;
}

function parseCollections(
  yaml: string,
): Array<{ name: string; version?: string }> {
  const galaxyMatch =
    /dependencies:\s*\n\s*galaxy:\s*\n\s*collections:\s*([\s\S]*?)(?=\n [a-z_]+:|$)/.exec(
      yaml,
    );
  if (!galaxyMatch) return [];
  const block = galaxyMatch[1];
  const nameRegex = /-\s*name:\s*['"]?([^'"\n]+)['"]?/g;
  const versionRegex = /\n\s*version:\s*['"]?([^'"\n]*)['"]?/;
  const out: Array<{ name: string; version?: string }> = [];
  let nameMatch = nameRegex.exec(block);
  while (nameMatch !== null) {
    const name = nameMatch[1].trim();
    const afterName = block.slice(nameMatch.index + nameMatch[0].length);
    const versionMatch = versionRegex.exec(afterName);
    const version =
      versionMatch && versionMatch.index === 0
        ? versionMatch[1]?.trim()
        : undefined;
    out.push({ name, version });
    nameMatch = nameRegex.exec(block);
  }
  return out;
}

function parseCollectionsFileRef(yaml: string): string | null {
  const m =
    /dependencies:\s*\n\s*galaxy:\s*['"]?([^\s'"]+\.(?:ya?ml|yml))['"]?/.exec(
      yaml,
    );
  return m ? m[1].trim() : null;
}

function parsePythonPath(yaml: string): string | null {
  const m =
    /python_interpreter:\s*\n\s*python_path:\s*['"]?([^'"\n]+)['"]?/.exec(yaml);
  return m ? m[1].trim() : null;
}

function extractPackagesFromListBlock(block: string): string[] {
  return block
    .split('\n')
    .map(line => line.replace(/^\s*-\s*['"]?([^'"\n]+)['"]?.*$/, '$1').trim())
    .filter(Boolean);
}

function parsePythonPackages(yaml: string): string[] | null {
  const m =
    /dependencies:\s*\n(?:[^\n]*\n)*?\s*python:\s*\n((?:\s*-\s*[^\n]+\n?)+)/.exec(
      yaml,
    );
  if (!m) return null;
  const packages = extractPackagesFromListBlock(m[1]);
  return packages.length > 0 ? packages : null;
}

function parsePythonFileRef(yaml: string): string | null {
  const m =
    /dependencies:\s*\n(?:[^\n]*\n)*?\s*python:\s*['"]?([^\s'"]+\.(?:txt|in))['"]?/.exec(
      yaml,
    );
  return m ? m[1].trim() : null;
}

function parseSystemPackages(yaml: string): string[] | null {
  const listMatch =
    /dependencies:\s*\n(?:[^\n]*\n)*\s*system:\s*\n((?:\s*-\s*[^\n]+\n?)+)/.exec(
      yaml,
    );
  if (listMatch) {
    const packages = extractPackagesFromListBlock(listMatch[1]);
    if (packages.length > 0) return packages;
  }
  const arrayMatch = /system:\s*\n\s*packages:\s*\[([\s\S]*?)\]/.exec(yaml);
  if (arrayMatch) {
    const listContent = arrayMatch[1];
    const packages = listContent
      .split(',')
      .map(s => s.replaceAll(/^['"]|['"]$/g, '').trim())
      .filter(Boolean);
    if (packages.length > 0) return packages;
  }
  return null;
}

function parseSystemFileRef(yaml: string): string | null {
  const m =
    /dependencies:\s*\n(?:[^\n]*\n)*\s*system:\s*['"]?([^\s'"]+\.(?:txt|in))['"]?/.exec(
      yaml,
    );
  return m ? m[1].trim() : null;
}

/**
 * Parse EE definition YAML content.
 * Returns null if definition is empty or invalid.
 */
export function parseEEDefinition(
  definitionYaml: string | undefined,
): ParsedEEDefinition | null {
  if (!definitionYaml || typeof definitionYaml !== 'string') return null;

  const result: ParsedEEDefinition = {
    baseImageName: null,
    collections: [],
    pythonPath: null,
    pythonPackages: null,
    pythonFileRef: null,
    systemPackages: null,
    systemFileRef: null,
    collectionsFileRef: null,
  };

  try {
    result.baseImageName = parseBaseImageName(definitionYaml);
    result.collections = parseCollections(definitionYaml);
    if (result.collections.length === 0) {
      result.collectionsFileRef = parseCollectionsFileRef(definitionYaml);
    }
    result.pythonPath = parsePythonPath(definitionYaml);
    result.pythonPackages = parsePythonPackages(definitionYaml);
    if (!result.pythonPackages?.length) {
      result.pythonFileRef = parsePythonFileRef(definitionYaml);
    }
    result.systemPackages = parseSystemPackages(definitionYaml);
    if (!result.systemPackages?.length) {
      result.systemFileRef = parseSystemFileRef(definitionYaml);
    }
  } catch {
    return null;
  }

  return result;
}
