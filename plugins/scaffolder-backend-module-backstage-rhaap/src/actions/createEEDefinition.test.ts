jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
  readdir: jest.fn(),
  rename: jest.fn(),
  rm: jest.fn(),
}));

const mockDownloadEEScaffold = jest.fn().mockResolvedValue(undefined);
jest.mock('./utils/api', () => ({
  BackendServiceAPI: jest.fn().mockImplementation(() => ({
    downloadEEScaffold: mockDownloadEEScaffold,
  })),
}));

jest.mock('@backstage/plugin-scaffolder-node', () => ({
  ...jest.requireActual('@backstage/plugin-scaffolder-node'),
  executeShellCommand: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./utils/utils', () => ({
  ...jest.requireActual('./utils/utils'),
  parseUploadedFileContent: jest.fn().mockReturnValue(''),
}));

global.fetch = jest.fn();

import * as fs from 'fs/promises';
import { mockServices } from '@backstage/backend-test-utils';
import { ConfigReader } from '@backstage/config';
import { parseUploadedFileContent } from './utils/utils';
import { createEEDefinitionAction } from './createEEDefinition';

const mockMkdir = fs.mkdir as jest.MockedFunction<typeof fs.mkdir>;
const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
const mockReaddir = fs.readdir as jest.MockedFunction<typeof fs.readdir>;
const mockRename = fs.rename as jest.MockedFunction<typeof fs.rename>;
const mockRm = fs.rm as jest.MockedFunction<typeof fs.rm>;
const mockParseUploadedFileContent =
  parseUploadedFileContent as jest.MockedFunction<
    typeof parseUploadedFileContent
  >;
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('createEEDefinition', () => {
  const logger = mockServices.logger.mock();
  const auth = mockServices.auth.mock();
  const discovery = mockServices.discovery.mock();
  const config = new ConfigReader({
    ansible: {
      creatorService: { baseUrl: 'localhost', port: '8000' },
      devSpaces: { baseUrl: 'https://devspaces.example.com' },
    },
  });
  const mockWorkspacePath = '/tmp/test-workspace';

  function makeCtx(values: Record<string, any>) {
    const valuesWithDefaults = {
      eeDescription: 'Execution Environment',
      ...values,
    };
    return {
      input: { values: valuesWithDefaults },
      logger,
      workspacePath: mockWorkspacePath,
      output: jest.fn(),
      user: { ref: 'user:default/testuser' },
    } as any;
  }

  function makeAction(cfg?: ConfigReader) {
    return createEEDefinitionAction({
      frontendUrl: 'http://localhost:3000',
      auth,
      discovery,
      config: cfg ?? config,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue('' as any);
    mockReaddir.mockResolvedValue([] as any);
    mockRename.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
    mockParseUploadedFileContent.mockReturnValue('');
    mockDownloadEEScaffold.mockResolvedValue(undefined);
    discovery.getBaseUrl.mockResolvedValue('http://localhost:7007/api/catalog');
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(''),
    } as any);
    auth.getOwnServiceCredentials.mockResolvedValue({
      token: 'service-token',
    } as any);
    auth.getPluginRequestToken.mockResolvedValue({
      token: 'plugin-token',
    } as any);
  });

  // ─── Handler: scaffold flow ─────────────────────────────────────────

  it('calls downloadEEScaffold and sets outputs', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'my-ee',
      baseImage: 'quay.io/ansible/ee-base:latest',
      publishToSCM: true,
    });

    await action.handler(ctx);

    expect(mockDownloadEEScaffold).toHaveBeenCalledTimes(1);
    expect(ctx.output).toHaveBeenCalledWith('owner', 'user:default/testuser');
    expect(ctx.output).toHaveBeenCalledWith('contextDirName', 'my-ee');
    expect(ctx.output).toHaveBeenCalledWith(
      'readmeContent',
      expect.stringContaining('Execution Environment'),
    );
    expect(ctx.output).toHaveBeenCalledWith(
      'catalogInfoPath',
      'my-ee/catalog-info.yaml',
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/test-workspace/my-ee/README.md',
      expect.stringContaining('Execution Environment'),
    );
    expect(ctx.output).toHaveBeenCalledWith(
      'generatedEntityRef',
      'http://localhost:3000/self-service/catalog/my-ee',
    );
  });

  it('sanitizes contextDirName from special characters', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'My EE @v2!',
      baseImage: 'img:latest',
      publishToSCM: true,
    });

    await action.handler(ctx);

    expect(ctx.output).toHaveBeenCalledWith('contextDirName', 'my-ee-v2');
  });

  it('distributes scaffold files between eeDir and workspace root', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
    });

    mockReaddir.mockResolvedValue([
      { name: 'test-ee.yml', isFile: () => true },
      { name: 'README.md', isFile: () => true },
      { name: '.github', isFile: () => false },
    ] as any);

    await action.handler(ctx);

    // EE-specific files go to eeDir
    expect(mockRename).toHaveBeenCalledWith(
      '/tmp/test-workspace/.ee-scaffold-tmp/test-ee.yml',
      '/tmp/test-workspace/test-ee/test-ee.yml',
    );
    expect(mockRename).toHaveBeenCalledWith(
      '/tmp/test-workspace/.ee-scaffold-tmp/README.md',
      '/tmp/test-workspace/test-ee/README.md',
    );
    // Non-EE files go to workspace root
    expect(mockRename).toHaveBeenCalledWith(
      '/tmp/test-workspace/.ee-scaffold-tmp/.github',
      '/tmp/test-workspace/.github',
    );
    // Temp dir cleaned up
    expect(mockRm).toHaveBeenCalledWith(
      '/tmp/test-workspace/.ee-scaffold-tmp',
      { recursive: true, force: true },
    );
  });

  it('writes template file when publishToSCM is true', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
    });

    await action.handler(ctx);

    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/test-workspace/test-ee/test-ee-template.yml',
      expect.stringContaining('kind: Template'),
    );
    expect(ctx.output).toHaveBeenCalledWith(
      'catalogInfoPath',
      'test-ee/catalog-info.yaml',
    );
  });

  it('registers catalog entity when publishToSCM is false', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: false,
      eeDescription: 'My EE',
    });

    await action.handler(ctx);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/catalog/ansible/ee',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws when catalog registration fails', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: false,
    });
    mockFetch.mockResolvedValue({
      ok: false,
      text: jest.fn().mockResolvedValue('Server error'),
    } as any);

    await expect(action.handler(ctx)).rejects.toThrow(
      'Failed to register EE definition',
    );
  });

  it('patches ansible.cfg with ignore_certs when present', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
    });

    // Return empty for most reads, but ansible.cfg content for the config path
    mockReadFile.mockImplementation(async (filePath: any) => {
      if (filePath.toString().endsWith('ansible.cfg')) {
        return '[galaxy]\nserver_list = my_hub\n' as any;
      }
      return '' as any;
    });

    await action.handler(ctx);

    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/test-workspace/test-ee/ansible.cfg',
      expect.stringContaining('ignore_certs = true'),
    );
  });

  it('patches ee-build.yml workflow ee_dir default', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'my-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
    });

    mockReadFile.mockImplementation(async (filePath: any) => {
      if (filePath.toString().endsWith('ee-build.yml')) {
        return '      default: "."\n' as any;
      }
      return '' as any;
    });

    await action.handler(ctx);

    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/test-workspace/.github/workflows/ee-build.yml',
      expect.stringContaining('default: "my-ee"'),
    );
  });

  it('throws when downloadEEScaffold fails', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
    });
    mockDownloadEEScaffold.mockRejectedValue(new Error(':downloadEEScaffold:'));

    await expect(action.handler(ctx)).rejects.toThrow(
      'Failed to create EE definition files',
    );
  });

  // ─── buildEEConfig (tested via eeConfig passed to downloadEEScaffold) ──

  it('builds eeConfig with base fields only', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'quay.io/test:latest',
      publishToSCM: true,
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig).toMatchObject({
      base_image: 'quay.io/test:latest',
      ee_file_name: 'test-ee.yml',
      registry_tls_verify: true,
    });
  });

  it('builds eeConfig with collections, python deps, system packages', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      collections: [
        { name: 'community.general', version: '1.0.0' },
        { name: 'ansible.netcommon' },
      ],
      pythonRequirements: ['requests>=2.28.0'],
      systemPackages: ['libssh-devel'],
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.collections).toEqual([
      { name: 'community.general', version: '1.0.0' },
      { name: 'ansible.netcommon' },
    ]);
    expect(eeConfig.python_deps).toEqual(['requests>=2.28.0']);
    expect(eeConfig.system_packages).toEqual(['libssh-devel']);
  });

  it('builds eeConfig with additional build steps', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      additionalBuildSteps: [
        { stepType: 'prepend_base', commands: ['RUN whoami'] },
        { stepType: 'prepend_base', commands: ['RUN pwd'] },
      ],
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.additional_build_steps).toEqual({
      prepend_base: ['RUN whoami', 'RUN pwd'],
    });
  });

  it('builds eeConfig with registry and image name', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      buildRegistry: 'ghcr.io',
      buildImageName: 'my-org/my-ee',
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.registry).toBe('ghcr.io');
    expect(eeConfig.image_name).toBe('my-org/my-ee');
  });

  it('resolves PAH registry to rhaap baseUrl hostname', async () => {
    const pahConfig = new ConfigReader({
      ansible: {
        creatorService: { baseUrl: 'localhost', port: '8000' },
        devSpaces: { baseUrl: 'https://devspaces.example.com' },
        rhaap: { baseUrl: 'https://pah.example.com' },
      },
    });
    const action = makeAction(pahConfig);
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      buildRegistry: 'Private Automation Hub (PAH)',
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.registry).toBe('pah.example.com');
  });

  it('passes PAH registry as-is when no rhaap baseUrl configured', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      buildRegistry: 'Private Automation Hub (PAH)',
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.registry).toBe('Private Automation Hub (PAH)');
  });

  it('sets registry_tls_verify false when explicitly disabled', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      registryTlsVerify: false,
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.registry_tls_verify).toBe(false);
  });

  // ─── mergeCollections (tested via eeConfig) ─────────────────────────

  it('deduplicates collections keeping entry without version', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      collections: [
        { name: 'community.general', version: '1.0.0' },
        { name: 'community.general' },
      ],
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.collections).toEqual([{ name: 'community.general' }]);
  });

  // ─── normalizeCollectionSources (tested via eeConfig) ───────────────

  it('normalizes PAH source to private_hub_ prefix', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      collections: [
        { name: 'my.collection', source: 'Private Automation Hub / validated' },
      ],
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.collections[0].source).toBe('private_hub_validated');
  });

  it('normalizes PAH source using deterministic repo-id rules', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      collections: [
        {
          name: 'my.collection',
          source: 'Private Automation Hub / My-- Repo__Name',
        },
      ],
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.collections[0].source).toBe('private_hub_my_repo_name');
  });

  it('drops source key when PAH repo name is empty', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      collections: [
        { name: 'my.collection', source: 'Private Automation Hub' },
      ],
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.collections[0]).toEqual({ name: 'my.collection' });
    expect(eeConfig.collections[0].source).toBeUndefined();
  });

  // ─── mergeRequirements / mergePackages ──────────────────────────────

  it('merges and deduplicates requirements from input and file', async () => {
    const action = makeAction();
    mockParseUploadedFileContent.mockReturnValueOnce(
      'requests>=2.28.0\nurllib3\n',
    );
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      pythonRequirements: ['requests>=2.28.0', 'boto3'],
      pythonRequirementsFile: 'data:text/plain;base64,...',
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.python_deps).toEqual([
      'requests>=2.28.0',
      'boto3',
      'urllib3',
    ]);
  });

  it('merges and deduplicates system packages from input and file', async () => {
    const action = makeAction();
    mockParseUploadedFileContent
      .mockReturnValueOnce('')
      .mockReturnValueOnce('libssh-devel\ngcc\n');
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      systemPackages: ['libssh-devel', 'openssl-devel'],
      systemPackagesFile: 'data:text/plain;base64,...',
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.system_packages).toEqual([
      'libssh-devel',
      'openssl-devel',
      'gcc',
    ]);
  });

  // ─── buildGalaxyServersFromConfig ───────────────────────────────────

  it('builds galaxy servers from catalog provider config', async () => {
    const pahConfig = new ConfigReader({
      ansible: {
        creatorService: { baseUrl: 'localhost', port: '8000' },
        devSpaces: { baseUrl: 'https://devspaces.example.com' },
        rhaap: { baseUrl: 'https://pah.example.com' },
      },
      catalog: {
        providers: {
          rhaap: {
            default: {
              sync: {
                pahCollections: {
                  repositories: [{ name: 'validated' }, { name: 'community' }],
                },
              },
            },
          },
        },
      },
    });
    const action = makeAction(pahConfig);
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.galaxy_servers).toEqual([
      {
        id: 'private_hub_validated',
        url: 'https://pah.example.com/api/galaxy/content/validated/',
        token_required: true,
      },
      {
        id: 'private_hub_community',
        url: 'https://pah.example.com/api/galaxy/content/community/',
        token_required: true,
      },
    ]);
  });

  it('uses the same PAH repo normalizer for galaxy server IDs', async () => {
    const pahConfig = new ConfigReader({
      ansible: {
        creatorService: { baseUrl: 'localhost', port: '8000' },
        devSpaces: { baseUrl: 'https://devspaces.example.com' },
        rhaap: { baseUrl: 'https://pah.example.com' },
      },
      catalog: {
        providers: {
          rhaap: {
            default: {
              sync: {
                pahCollections: {
                  repositories: [{ name: 'My-- Repo__Name' }],
                },
              },
            },
          },
        },
      },
    });
    const action = makeAction(pahConfig);
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      collections: [
        {
          name: 'my.collection',
          source: 'Private Automation Hub / My-- Repo__Name',
        },
      ],
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.collections[0].source).toBe('private_hub_my_repo_name');
    expect(eeConfig.galaxy_servers[0].id).toBe('private_hub_my_repo_name');
  });

  it('skips galaxy servers when pahCollections.enabled is false', async () => {
    const pahConfig = new ConfigReader({
      ansible: {
        creatorService: { baseUrl: 'localhost', port: '8000' },
        devSpaces: { baseUrl: 'https://devspaces.example.com' },
        rhaap: { baseUrl: 'https://pah.example.com' },
      },
      catalog: {
        providers: {
          rhaap: {
            default: {
              sync: {
                pahCollections: {
                  enabled: false,
                  repositories: [{ name: 'validated' }],
                },
              },
            },
          },
        },
      },
    });
    const action = makeAction(pahConfig);
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.galaxy_servers).toBeUndefined();
  });

  // ─── generateEETemplate ─────────────────────────────────────────────

  it('generates valid template YAML with all inputs', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      eeDescription: 'My test EE',
      baseImage: 'img:latest',
      publishToSCM: true,
      collections: [{ name: 'community.general' }],
      pythonRequirements: ['requests'],
      systemPackages: ['gcc'],
      additionalBuildSteps: [
        { stepType: 'prepend_base', commands: ['RUN whoami'] },
      ],
      tags: ['execution-environment', 'test'],
    });

    await action.handler(ctx);

    const templateWriteCall = mockWriteFile.mock.calls.find((call: any[]) =>
      call[0].toString().endsWith('-template.yml'),
    );
    expect(templateWriteCall).toBeDefined();
    const content = templateWriteCall![1] as string;
    expect(content).toContain('kind: Template');
    expect(content).toContain('name: test-ee');
    expect(content).toContain('type: execution-environment');
    expect(content).toContain('ansible.io/saved-template');
    expect(content).toContain('BaseImagePicker');
    expect(content).toContain('CollectionsPicker');
    expect(content).toContain('PackagesPicker');
    expect(content).toContain('AdditionalBuildStepsPicker');
  });

  it('includes custom base image in template enum when provided', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'quay.io/custom/image:1.0',
      customBaseImage: 'quay.io/custom/image:1.0',
      publishToSCM: true,
    });

    await action.handler(ctx);

    const templateWriteCall = mockWriteFile.mock.calls.find((call: any[]) =>
      call[0].toString().endsWith('-template.yml'),
    );
    const content = templateWriteCall![1] as string;
    expect(content).toContain("'quay.io/custom/image:1.0'");
  });

  it('includes all build step types in template enum', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
    });

    await action.handler(ctx);

    const templateWriteCall = mockWriteFile.mock.calls.find((call: any[]) =>
      call[0].toString().endsWith('-template.yml'),
    );
    const content = templateWriteCall![1] as string;
    for (const step of [
      'prepend_base',
      'append_base',
      'prepend_galaxy',
      'append_galaxy',
      'prepend_builder',
      'append_builder',
      'prepend_final',
      'append_final',
    ]) {
      expect(content).toContain(step);
    }
  });

  // ─── Edge cases for coverage gaps ───────────────────────────────────

  it('handles missing ansible.cfg gracefully', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: false,
    });
    mockReadFile.mockImplementation(async (filePath: any) => {
      if (filePath.toString().endsWith('ansible.cfg')) {
        throw new Error('ENOENT');
      }
      return '' as any;
    });

    await action.handler(ctx);

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('no ansible.cfg'),
    );
  });

  it('deduplicates collections keeping higher semver version', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      collections: [
        { name: 'community.general', version: '1.0.0' },
        { name: 'community.general', version: '2.0.0' },
      ],
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.collections).toEqual([
      { name: 'community.general', version: '2.0.0' },
    ]);
  });

  it('keeps existing versionless collection over versioned duplicate', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      collections: [
        { name: 'community.general' },
        { name: 'community.general', version: '1.0.0' },
      ],
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.collections).toEqual([{ name: 'community.general' }]);
  });

  it('deduplicates galaxy servers across provider envs', async () => {
    const pahConfig = new ConfigReader({
      ansible: {
        creatorService: { baseUrl: 'localhost', port: '8000' },
        devSpaces: { baseUrl: 'https://devspaces.example.com' },
        rhaap: { baseUrl: 'https://pah.example.com' },
      },
      catalog: {
        providers: {
          rhaap: {
            env1: {
              sync: {
                pahCollections: {
                  repositories: [{ name: 'validated' }],
                },
              },
            },
            env2: {
              sync: {
                pahCollections: {
                  repositories: [{ name: 'validated' }, { name: 'community' }],
                },
              },
            },
          },
        },
      },
    });
    const action = makeAction(pahConfig);
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.galaxy_servers).toHaveLength(2);
  });

  it('skips provider env without pahCollections.repositories', async () => {
    const pahConfig = new ConfigReader({
      ansible: {
        creatorService: { baseUrl: 'localhost', port: '8000' },
        devSpaces: { baseUrl: 'https://devspaces.example.com' },
        rhaap: { baseUrl: 'https://pah.example.com' },
      },
      catalog: {
        providers: {
          rhaap: {
            default: {
              sync: {
                pahCollections: {},
              },
            },
          },
        },
      },
    });
    const action = makeAction(pahConfig);
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.galaxy_servers).toBeUndefined();
  });

  it('no-ops patchWorkflowEeDir when workflow file is missing', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
    });
    mockReadFile.mockImplementation(async (filePath: any) => {
      if (filePath.toString().endsWith('ee-build.yml')) {
        throw new Error('ENOENT');
      }
      return '' as any;
    });

    await action.handler(ctx);

    const workflowWriteCall = mockWriteFile.mock.calls.find((call: any[]) =>
      call[0].toString().includes('ee-build.yml'),
    );
    expect(workflowWriteCall).toBeUndefined();
  });

  it('passes correct entity shape to catalog ansible/ee endpoint', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      eeDescription: 'Test EE desc',
      baseImage: 'img:latest',
      publishToSCM: false,
      tags: ['execution-environment'],
    });

    mockReadFile.mockImplementation(async (filePath: any) => {
      if (filePath.toString().endsWith('.yml')) return 'ee-def-content' as any;
      if (filePath.toString().endsWith('ansible.cfg'))
        return '[galaxy]\nserver_list = hub\n' as any;
      return '' as any;
    });

    await action.handler(ctx);

    const [, fetchOptions] = (mockFetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);
    expect(body.entity).toMatchObject({
      kind: 'Component',
      metadata: {
        name: 'test-ee',
        description: 'Test EE desc',
        tags: ['execution-environment'],
        annotations: {
          'ansible.io/download-experience': 'true',
        },
      },
      spec: {
        type: 'execution-environment',
        owner: 'user:default/testuser',
        definition: 'ee-def-content',
        readme: expect.stringContaining('Execution Environment'),
      },
    });
  });

  it('uses owner from input when provided', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      owner: 'group:default/platform',
    });

    await action.handler(ctx);

    expect(ctx.output).toHaveBeenCalledWith('owner', 'group:default/platform');
  });

  it('falls back to customBaseImage when baseImage is empty', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: '',
      customBaseImage: 'quay.io/org/custom:latest',
      publishToSCM: true,
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.base_image).toBe('quay.io/org/custom:latest');
  });

  it('canonicalizes eeFileName by stripping leading path', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: '../evil',
      baseImage: 'img:latest',
      publishToSCM: true,
    });

    await action.handler(ctx);

    expect(ctx.output).toHaveBeenCalledWith('contextDirName', 'evil');
    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.ee_file_name).toBe('evil.yml');
  });

  it('canonicalizes eeFileName by removing one trailing yaml extension', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'My-EE.yaml',
      baseImage: 'img:latest',
      publishToSCM: true,
    });

    await action.handler(ctx);

    expect(ctx.output).toHaveBeenCalledWith('contextDirName', 'my-ee');
    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.ee_file_name).toBe('my-ee.yml');
  });

  it('rejects eeFileName when canonical slug becomes empty', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: '   .yaml   ',
      baseImage: 'img:latest',
      publishToSCM: true,
    });

    await expect(action.handler(ctx)).rejects.toThrow(
      'Invalid eeFileName: canonical name is empty',
    );
    expect(mockDownloadEEScaffold).not.toHaveBeenCalled();
  });

  // ─── SCM collections: partition, transform, scmServers ──────────────

  function makeScmConfig(gitProviders?: Record<string, any[]>) {
    return new ConfigReader({
      ansible: {
        creatorService: { baseUrl: 'localhost', port: '8000' },
        devSpaces: { baseUrl: 'https://devspaces.example.com' },
      },
      catalog: {
        providers: {
          rhaap: {
            default: {
              sync: {
                ansibleGitContents: { providers: gitProviders ?? {} },
              },
            },
          },
        },
      },
    });
  }

  it('partitions SCM collections from non-SCM and transforms git URLs', async () => {
    const scmCfg = makeScmConfig({
      github: [{ name: 'github-public', host: 'github.com' }],
    });
    const action = makeAction(scmCfg);
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      collections: [
        { name: 'community.general' },
        {
          name: 'my.scm_collection',
          source: 'Github / github-public / my-org / my-repo',
          version: 'main',
        },
      ],
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.collections).toEqual([
      { name: 'community.general' },
      {
        name: 'https://${AAP_EE_BUILDER_GITHUB_GITHUB_PUBLIC_MY_ORG_TOKEN}@github.com/my-org/my-repo',
        type: 'git',
        version: 'main',
      },
    ]);
  });

  it('produces scmServers alongside SCM collections', async () => {
    const scmCfg = makeScmConfig({
      github: [{ name: 'github-public', host: 'github.com' }],
    });
    const action = makeAction(scmCfg);
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      collections: [
        {
          name: 'col1',
          source: 'Github / github-public / org1 / repo1',
          version: 'v1.0',
        },
        {
          name: 'col2',
          source: 'Github / github-public / org2 / repo2',
        },
      ],
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.scm_servers).toEqual([
      {
        id: 'aap_ee_builder_github_github_public_org1_token',
        hostname: 'github.com',
        token_env_var: 'AAP_EE_BUILDER_GITHUB_GITHUB_PUBLIC_ORG1_TOKEN',
      },
      {
        id: 'aap_ee_builder_github_github_public_org2_token',
        hostname: 'github.com',
        token_env_var: 'AAP_EE_BUILDER_GITHUB_GITHUB_PUBLIC_ORG2_TOKEN',
      },
    ]);
  });

  it('deduplicates scmServers when multiple collections share the same provider and org', async () => {
    const scmCfg = makeScmConfig({
      gitlab: [{ name: 'corp-gitlab', host: 'gitlab.corp.com' }],
    });
    const action = makeAction(scmCfg);
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      collections: [
        {
          name: 'col1',
          source: 'Gitlab / corp-gitlab / team / repo-a',
        },
        {
          name: 'col2',
          source: 'Gitlab / corp-gitlab / team / repo-b',
        },
      ],
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.scm_servers).toHaveLength(1);
    expect(eeConfig.collections).toHaveLength(2);
  });

  it('defaults SCM host to <provider>.com when host is not configured', async () => {
    const scmCfg = makeScmConfig({
      github: [{ name: 'my-gh' }],
    });
    const action = makeAction(scmCfg);
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      collections: [
        {
          name: 'col',
          source: 'Github / my-gh / org / repo',
        },
      ],
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.collections[0].name).toContain('@github.com/');
  });

  it('throws when SCM canonical name is not found in config', async () => {
    const scmCfg = makeScmConfig({ github: [{ name: 'other-host' }] });
    const action = makeAction(scmCfg);
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      collections: [
        {
          name: 'col',
          source: 'Github / unknown-host / org / repo',
        },
      ],
    });

    await expect(action.handler(ctx)).rejects.toThrow(
      'Cannot resolve SCM host',
    );
  });

  it('throws when no rhaap config exists for SCM host lookup', async () => {
    const noRhaapCfg = new ConfigReader({
      ansible: {
        creatorService: { baseUrl: 'localhost', port: '8000' },
        devSpaces: { baseUrl: 'https://devspaces.example.com' },
      },
    });
    const action = makeAction(noRhaapCfg);
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      collections: [
        {
          name: 'col',
          source: 'Github / gh-pub / org / repo',
        },
      ],
    });

    await expect(action.handler(ctx)).rejects.toThrow(
      'Cannot resolve SCM host',
    );
  });

  it('strips display metadata after "/" from SCM collection version', async () => {
    const scmCfg = makeScmConfig({
      github: [{ name: 'gh', host: 'github.com' }],
    });
    const action = makeAction(scmCfg);
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      collections: [
        {
          name: 'col',
          source: 'Github / gh / org / repo',
          version: 'main / extra-info',
        },
      ],
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.collections[0].version).toBe('main');
  });

  it('omits scmServers from eeConfig when no SCM collections', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      collections: [{ name: 'community.general' }],
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.scm_servers).toBeUndefined();
  });

  // ─── Input sanitization (canonicalize + validate pipeline) ────────────

  it('sanitizes NUL bytes out of eeFileName via canonicalization', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'bad\0name',
      baseImage: 'img:latest',
      publishToSCM: true,
    });

    await action.handler(ctx);

    expect(ctx.output).toHaveBeenCalledWith('contextDirName', 'bad-name');
  });

  it('extracts basename from absolute eeFileName path', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: '/etc/passwd',
      baseImage: 'img:latest',
      publishToSCM: true,
    });

    await action.handler(ctx);

    expect(ctx.output).toHaveBeenCalledWith('contextDirName', 'passwd');
  });

  it('extracts basename from eeFileName with path separators', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'foo/bar',
      baseImage: 'img:latest',
      publishToSCM: true,
    });

    await action.handler(ctx);

    expect(ctx.output).toHaveBeenCalledWith('contextDirName', 'bar');
  });

  it('sanitizes backslash in eeFileName to dash', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'foo\\bar',
      baseImage: 'img:latest',
      publishToSCM: true,
    });

    await action.handler(ctx);

    expect(ctx.output).toHaveBeenCalledWith('contextDirName', 'foo-bar');
  });

  // ─── Edge cases for deeper coverage ─────────────────────────────────

  it('strips trailing slashes from PAH base URL', async () => {
    const trailingSlashConfig = new ConfigReader({
      ansible: {
        creatorService: { baseUrl: 'localhost', port: '8000' },
        devSpaces: { baseUrl: 'https://devspaces.example.com' },
        rhaap: { baseUrl: 'https://pah.example.com///' },
      },
      catalog: {
        providers: {
          rhaap: {
            default: {
              sync: {
                pahCollections: {
                  repositories: [{ name: 'published' }],
                },
              },
            },
          },
        },
      },
    });
    const action = makeAction(trailingSlashConfig);
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.galaxy_servers[0].url).toBe(
      'https://pah.example.com/api/galaxy/content/published/',
    );
  });

  it('normalizes PAH repo names with leading/trailing special chars', async () => {
    const pahConfig = new ConfigReader({
      ansible: {
        creatorService: { baseUrl: 'localhost', port: '8000' },
        devSpaces: { baseUrl: 'https://devspaces.example.com' },
        rhaap: { baseUrl: 'https://pah.example.com' },
      },
      catalog: {
        providers: {
          rhaap: {
            default: {
              sync: {
                pahCollections: {
                  repositories: [{ name: '---Published---' }],
                },
              },
            },
          },
        },
      },
    });
    const action = makeAction(pahConfig);
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.galaxy_servers[0].id).toBe('private_hub_published');
  });

  it('generates README without ansible.cfg section when cfg is absent', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
    });
    mockReadFile.mockImplementation(async (filePath: any) => {
      if (filePath.toString().endsWith('ansible.cfg')) {
        throw new Error('ENOENT');
      }
      return '' as any;
    });

    await action.handler(ctx);

    const readmeCall = mockWriteFile.mock.calls.find((call: any[]) =>
      call[0].toString().endsWith('README.md'),
    );
    const readme = readmeCall![1] as string;
    expect(readme).toContain(
      'collection-source token configuration steps are omitted',
    );
    expect(readme).not.toContain('Configure Automation Hub access');
  });

  it('does not patch ansible.cfg when [galaxy] section is absent', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
    });
    mockReadFile.mockImplementation(async (filePath: any) => {
      if (filePath.toString().endsWith('ansible.cfg')) {
        return '[defaults]\nhost_key_checking = False\n' as any;
      }
      return '' as any;
    });

    await action.handler(ctx);

    const cfgWriteCall = mockWriteFile.mock.calls.find((call: any[]) =>
      call[0].toString().endsWith('ansible.cfg'),
    );
    const cfgContent = cfgWriteCall![1] as string;
    expect(cfgContent).not.toContain('ignore_certs');
  });

  it('passes non-PAH non-SCM collection sources through unchanged', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      eeFileName: 'test-ee',
      baseImage: 'img:latest',
      publishToSCM: true,
      collections: [
        {
          name: 'custom.col',
          source: 'https://galaxy.custom.com',
          type: 'galaxy',
        },
      ],
    });

    await action.handler(ctx);

    const eeConfig = mockDownloadEEScaffold.mock.calls[0][3];
    expect(eeConfig.collections[0]).toEqual({
      name: 'custom.col',
      source: 'https://galaxy.custom.com',
      type: 'galaxy',
    });
  });
});
