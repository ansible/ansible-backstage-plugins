import { parseEEDefinition } from './schemas';

describe('parseEEDefinition', () => {
  it('returns null for empty, non-string, malformed, and oversized input', () => {
    expect(parseEEDefinition(undefined)).toBeNull();
    expect(parseEEDefinition('')).toBeNull();
    expect(parseEEDefinition(null as any)).toBeNull();
    expect(parseEEDefinition(123 as any)).toBeNull();
    expect(parseEEDefinition('{{{')).toBeNull();
    expect(parseEEDefinition('a'.repeat(100_001))).toBeNull();
  });

  it('parses the base image and interpreter path', () => {
    const result = parseEEDefinition(`
      images:
        base_image:
          name: registry.redhat.io/ee-minimal:2.18
      dependencies:
        python_interpreter:
          python_path: /usr/bin/python3.11
    `);

    expect(result).toEqual(
      expect.objectContaining({
        baseImageName: 'registry.redhat.io/ee-minimal:2.18',
        pythonPath: '/usr/bin/python3.11',
      }),
    );
  });

  it('parses inline galaxy and python/system dependencies', () => {
    const result = parseEEDefinition(`
      dependencies:
        galaxy:
          collections:
            - name: cisco.nxos
              version: 2.0.0
            - name: amazon.aws
              type: galaxy
        python:
          - six
          - psutil
        system:
          packages:
            - git
            - curl
    `);

    expect(result).toEqual(
      expect.objectContaining({
        collections: [
          { name: 'cisco.nxos', version: '2.0.0' },
          { name: 'amazon.aws', type: 'galaxy' },
        ],
        pythonPackages: ['six', 'psutil'],
        systemPackages: ['git', 'curl'],
      }),
    );
  });

  it('parses galaxy, python, and system file references', () => {
    const result = parseEEDefinition(`
      dependencies:
        galaxy: requirements.yaml
        python: requirements.in
        system: bindep.txt
    `);

    expect(result).toEqual(
      expect.objectContaining({
        collections: [],
        collectionsFileRef: 'requirements.yaml',
        pythonPackages: null,
        pythonFileRef: 'requirements.in',
        systemPackages: null,
        systemFileRef: 'bindep.txt',
      }),
    );
  });

  it('filters invalid dependency values and handles non-record sections', () => {
    const result = parseEEDefinition(`
      images:
        base_image: invalid
      dependencies:
        galaxy:
          collections:
            - name: valid.collection
            - version: 1.0.0
        python:
          - 123
          - "   "
          - valid-pkg
        system: 456
    `);

    expect(result).toEqual(
      expect.objectContaining({
        baseImageName: null,
        collections: [{ name: 'valid.collection' }],
        pythonPackages: ['valid-pkg'],
        systemPackages: null,
        systemFileRef: null,
      }),
    );
  });

  it('returns null for a scalar YAML document', () => {
    expect(parseEEDefinition('just-a-string')).toBeNull();
  });
});
