import { parseEEDefinition } from './eeDefinitionUtils';

describe('parseEEDefinition', () => {
  it('returns null for undefined or empty input', () => {
    expect(parseEEDefinition(undefined)).toBeNull();
    expect(parseEEDefinition('')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(parseEEDefinition(null as any)).toBeNull();
    expect(parseEEDefinition(123 as any)).toBeNull();
  });

  it('parses base image name from images.base_image.name', () => {
    const yaml = `
  images:
    base_image:
      name: 'registry.redhat.io/ee-minimal-rhel8:2.18'
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.baseImageName).toBe(
      'registry.redhat.io/ee-minimal-rhel8:2.18',
    );
  });

  it('parses inline galaxy collections', () => {
    const yaml = `
  dependencies:
    galaxy:
      collections:
        - name: cisco.nxos
          version: 2.0.0
        - name: amazon.aws
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.collections).toHaveLength(2);
    expect(result!.collections[0]).toEqual({
      name: 'cisco.nxos',
      version: '2.0.0',
    });
    expect(result!.collections[1]).toEqual({
      name: 'amazon.aws',
      version: undefined,
    });
  });

  it('parses galaxy file reference when no inline collections', () => {
    const yaml = `
  dependencies:
    galaxy: requirements.yaml
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.collections).toHaveLength(0);
    expect(result!.collectionsFileRef).toBe('requirements.yaml');
  });

  it('parses collections when galaxy comes after python and system (scaffolder order)', () => {
    const yaml = `
  dependencies:
    python:
      - six
    system:
      - git
    galaxy:
      collections:
        - name: my.namespace
          version: 2.0.0
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.collections).toHaveLength(1);
    expect(result!.collections[0]).toEqual({
      name: 'my.namespace',
      version: '2.0.0',
    });
    expect(result!.pythonPackages).toEqual(['six']);
    expect(result!.systemPackages).toEqual(['git']);
  });

  it('parses python_interpreter.python_path', () => {
    const yaml = `
  dependencies:
    python_interpreter:
      python_path: "/usr/bin/python3.11"
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.pythonPath).toBe('/usr/bin/python3.11');
  });

  it('parses inline python requirements (pip list)', () => {
    const yaml = `
  dependencies:
    python:
      - six
      - psutil
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.pythonPackages).toEqual(['six', 'psutil']);
  });

  it('parses python file reference when no inline list', () => {
    const yaml = `
  dependencies:
    python: requirements.txt
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.pythonFileRef).toBe('requirements.txt');
  });

  it('parses inline system packages', () => {
    const yaml = `
  dependencies:
    system:
      - git
      - curl
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.systemPackages).toEqual(['git', 'curl']);
  });

  it('parses system file reference when no inline list', () => {
    const yaml = `
  dependencies:
    system: bindep.txt
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.systemFileRef).toBe('bindep.txt');
  });

  it('returns null when definition exceeds max length', () => {
    const oversized = 'a'.repeat(100_001);
    expect(parseEEDefinition(oversized)).toBeNull();
  });

  it('coerces number values to string via asString', () => {
    const yaml = `
  images:
    base_image:
      name: 123
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.baseImageName).toBe('123');
  });

  it('returns null for whitespace-only string fields', () => {
    const yaml = `
  images:
    base_image:
      name: "   "
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.baseImageName).toBeNull();
  });

  it('returns null baseImageName when base_image is not a record', () => {
    const yaml = `
  images:
    base_image: just-a-string
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.baseImageName).toBeNull();
  });

  it('ignores non-array non-string python dependency', () => {
    const yaml = `
  dependencies:
    python: 123
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.pythonPackages).toBeNull();
    expect(result!.pythonFileRef).toBeNull();
  });

  it('filters non-string and empty entries from python list', () => {
    const yaml = `
  dependencies:
    python:
      - 123
      - "   "
      - ""
      - valid-pkg
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.pythonPackages).toEqual(['valid-pkg']);
  });

  it('returns null pythonPackages when all entries are invalid', () => {
    const yaml = `
  dependencies:
    python:
      - 123
      - "   "
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.pythonPackages).toBeNull();
  });

  it('parses collection with type field', () => {
    const yaml = `
  dependencies:
    galaxy:
      collections:
        - name: ansible.netcommon
          version: 5.0.0
          type: galaxy
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.collections).toHaveLength(1);
    expect(result!.collections[0]).toEqual({
      name: 'ansible.netcommon',
      version: '5.0.0',
      type: 'galaxy',
    });
  });

  it('parses system packages from object with packages array', () => {
    const yaml = `
  dependencies:
    system:
      packages:
        - git
        - curl
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.systemPackages).toEqual(['git', 'curl']);
  });

  it('returns empty array when galaxy collections is not an array', () => {
    const yaml = `
  dependencies:
    galaxy:
      collections: not-an-array
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.collections).toEqual([]);
  });

  it('returns null for invalid YAML syntax', () => {
    expect(parseEEDefinition('{{{')).toBeNull();
  });

  it('returns null when YAML parses to a non-record (e.g. scalar)', () => {
    expect(parseEEDefinition('just-a-string')).toBeNull();
  });

  it('returns null baseImageName when images is not a record', () => {
    const yaml = `
  images: not-a-record
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.baseImageName).toBeNull();
  });

  it('returns null pythonPath when python_interpreter is not a record', () => {
    const yaml = `
  dependencies:
    python_interpreter: not-a-record
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.pythonPath).toBeNull();
  });

  it('skips non-record collection entries in galaxy', () => {
    const yaml = `
  dependencies:
    galaxy:
      collections:
        - not-a-record
        - name: valid.collection
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.collections).toHaveLength(1);
    expect(result!.collections[0].name).toBe('valid.collection');
  });

  it('skips collections without a string name', () => {
    const yaml = `
  dependencies:
    galaxy:
      collections:
        - version: 1.0.0
        - name: 123
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.collections).toHaveLength(0);
  });

  it('handles galaxy .yml file reference', () => {
    const yaml = `
  dependencies:
    galaxy: requirements.yml
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.collectionsFileRef).toBe('requirements.yml');
  });

  it('ignores galaxy when neither record nor matching file reference', () => {
    const yaml = `
  dependencies:
    galaxy: 123
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.collections).toHaveLength(0);
    expect(result!.collectionsFileRef).toBeNull();
  });

  it('handles system .in file reference', () => {
    const yaml = `
  dependencies:
    system: packages.in
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.systemFileRef).toBe('packages.in');
  });

  it('ignores system when neither array nor record nor matching file reference', () => {
    const yaml = `
  dependencies:
    system: 456
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.systemPackages).toBeNull();
    expect(result!.systemFileRef).toBeNull();
  });

  it('handles python .in file reference', () => {
    const yaml = `
  dependencies:
    python: requirements.in
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.pythonFileRef).toBe('requirements.in');
  });

  it('returns full result for complete definition', () => {
    const yaml = `
  version: 3
  images:
    base_image:
      name: 'registry.redhat.io/ee-minimal:2.18'
  dependencies:
    galaxy:
      collections:
        - name: community.general
          version: 1.0.0
    python:
      - requests
    system:
      - git
  `;
    const result = parseEEDefinition(yaml);
    expect(result).not.toBeNull();
    expect(result!.baseImageName).toBe('registry.redhat.io/ee-minimal:2.18');
    expect(result!.collections).toHaveLength(1);
    expect(result!.collections[0].name).toBe('community.general');
    expect(result!.pythonPackages).toContain('requests');
    expect(result!.systemPackages).toContain('git');
  });
});
