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

/**
 * Parse EE definition YAML content.
 * Returns null if definition is empty or invalid.
 */
export function parseEEDefinition(definitionYaml: string | undefined): ParsedEEDefinition | null {
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
    // Base image: images.base_image.name
    const imagesBlock = definitionYaml.match(
      /images:\s*\n\s*base_image:\s*\n\s*name:\s*['"]?([^'"\n]+)['"]?/,
    );
    if (imagesBlock) result.baseImageName = imagesBlock[1].trim();

    // Collections: dependencies.galaxy.collections (inline list)
    const galaxyMatch = definitionYaml.match(
      /dependencies:\s*\n\s*galaxy:\s*\n\s*collections:\s*([\s\S]*?)(?=\n [a-z_]+:|$)/,
    );
    if (galaxyMatch) {
      const block = galaxyMatch[1];
      const itemRegex = /-\s*name:\s*['"]?([^'"\n]+)['"]?(?:\s*\n\s*version:\s*['"]?([^'"\n]*)['"]?)?/g;
      let m = itemRegex.exec(block);
      while (m !== null) {
        result.collections.push({ name: m[1].trim(), version: m[2]?.trim() });
        m = itemRegex.exec(block);
      }    }
    // Galaxy file reference: dependencies.galaxy: requirements.yaml
    if (result.collections.length === 0) {
      const galaxyRefMatch = definitionYaml.match(
        /dependencies:\s*\n\s*galaxy:\s*['"]?([^\s'"\n]+\.(?:ya?ml|yml))['"]?/,
      );
      if (galaxyRefMatch) result.collectionsFileRef = galaxyRefMatch[1].trim();
    }

    // Python: dependencies.python_interpreter.python_path
    const pythonMatch = definitionYaml.match(
      /python_interpreter:\s*\n\s*python_path:\s*['"]?([^'"\n]+)['"]?/,
    );
    if (pythonMatch) result.pythonPath = pythonMatch[1].trim();

    // Python requirements: dependencies.python (inline list of pip packages)
    const pythonListMatch = definitionYaml.match(
      /dependencies:\s*\n(?:[\s\S]*?\n)*?\s*python:\s*\n((?:\s*-\s*[^\n]+\n?)+)/,
    );
    if (pythonListMatch) {
      const block = pythonListMatch[1];
      const packages = block
        .split('\n')
        .map(line => line.replace(/^\s*-\s*['"]?([^'"\n]+)['"]?.*$/, '$1').trim())
        .filter(Boolean);
      if (packages.length > 0) result.pythonPackages = packages;
    }
    // Python file reference: dependencies.python: requirements.txt
    if (!result.pythonPackages?.length) {
      const pythonRefMatch = definitionYaml.match(
        /dependencies:\s*\n(?:[\s\S]*?\n)*?\s*python:\s*['"]?([^\s'"\n]+\.(?:txt|in))['"]?/,
      );
      if (pythonRefMatch) result.pythonFileRef = pythonRefMatch[1].trim();
    }

    // System packages: dependencies.system (inline list)
    const systemListMatch = definitionYaml.match(
      /dependencies:\s*\n(?:[\s\S]*?\n)*\s*system:\s*\n((?:\s*-\s*[^\n]+\n?)+)/,
    );
    if (systemListMatch) {
      const block = systemListMatch[1];
      const packages = block
        .split('\n')
        .map(line => line.replace(/^\s*-\s*['"]?([^'"\n]+)['"]?.*$/, '$1').trim())
        .filter(Boolean);
      if (packages.length > 0) result.systemPackages = packages;
    }
    if (!result.systemPackages?.length) {
      const systemPackagesMatch = definitionYaml.match(
        /system:\s*\n\s*packages:\s*\[([\s\S]*?)\]/,
      );
      if (systemPackagesMatch) {
        const listContent = systemPackagesMatch[1];
        const packages = listContent
          .split(',')
          .map(s => s.replace(/^['"]|['"]$/g, '').trim())
          .filter(Boolean);
        if (packages.length > 0) result.systemPackages = packages;
      }
    }
    // System file reference: dependencies.system: bindep.txt
    if (!result.systemPackages?.length) {
      const systemRefMatch = definitionYaml.match(
        /dependencies:\s*\n(?:[\s\S]*?\n)*\s*system:\s*['"]?([^\s'"\n]+\.(?:txt|in))['"]?/,
      );
      if (systemRefMatch) result.systemFileRef = systemRefMatch[1].trim();
    }
  } catch {
    return null;
  }

  return result;
}