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
