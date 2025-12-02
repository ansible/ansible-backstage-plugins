/*
 * Copyright 2024 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Mock external dependencies first (before imports for proper hoisting)
jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}));

jest.mock('js-yaml', () => ({
  load: jest.fn(),
  dump: jest.fn(),
  default: {
    load: jest.fn(),
    dump: jest.fn(),
  },
}));

jest.mock('semver', () => ({
  gt: jest.fn(),
}));

jest.mock('./helpers/schemas', () => ({
  CollectionRequirementsSchema: {
    parse: jest.fn(),
  },
  EEDefinitionSchema: {
    parse: jest.fn(),
  },
}));

jest.mock('./utils/utils', () => ({
  parseUploadedFileContent: jest.fn(),
}));

// Mock global fetch
global.fetch = jest.fn();

import dedent from 'dedent';
import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import * as semver from 'semver';
import { z } from 'zod';
import { mockServices } from '@backstage/backend-test-utils';
import {
  CollectionRequirementsSchema,
  EEDefinitionSchema,
} from './helpers/schemas';
import { parseUploadedFileContent } from './utils/utils';
import { createEEDefinitionAction } from './createEEDefinition';

const mockMkdir = fs.mkdir as jest.MockedFunction<typeof fs.mkdir>;
const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
const mockYamlLoad = yaml.load as jest.MockedFunction<typeof yaml.load>;
const mockYamlDump = yaml.dump as jest.MockedFunction<typeof yaml.dump>;
const mockSemverGt = semver.gt as jest.MockedFunction<typeof semver.gt>;
const mockCollectionRequirementsSchemaParse = (
  CollectionRequirementsSchema as any
).parse as jest.MockedFunction<typeof CollectionRequirementsSchema.parse>;
const mockEEDefinitionSchemaParse = (EEDefinitionSchema as any)
  .parse as jest.MockedFunction<typeof EEDefinitionSchema.parse>;
const mockParseUploadedFileContent =
  parseUploadedFileContent as jest.MockedFunction<
    typeof parseUploadedFileContent
  >;
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

// Import internal functions for testing (we'll need to export them or test via the action)
// Since we can't easily test private functions, we'll test through the action handler
// But let's create a test file that focuses on testing the logic through the action

describe('createEEDefinition', () => {
  const logger = mockServices.logger.mock();
  const auth = mockServices.auth.mock();
  const discovery = mockServices.discovery.mock();
  const mockWorkspacePath = '/tmp/test-workspace';

  beforeEach(() => {
    jest.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockParseUploadedFileContent.mockReturnValue('');
    // Use real yaml.load and yaml.dump implementation by default so validation works
    const realYaml = jest.requireActual('js-yaml');
    mockYamlLoad.mockImplementation(realYaml.load);
    mockYamlDump.mockImplementation(realYaml.dump);
    // Use real EEDefinitionSchema.parse implementation by default
    const realSchemas = jest.requireActual('./helpers/schemas');
    mockEEDefinitionSchemaParse.mockImplementation(
      realSchemas.EEDefinitionSchema.parse,
    );
    discovery.getBaseUrl.mockResolvedValue('http://localhost:7007/api/catalog');
    // Mock server manifest for MCP vars generation
    const mockServerManifest = `---
- role: common
  servers: []
  vars:
    common_mcp_base_path: /opt/mcp
    common_golang_version: 1.25.4
    common_nodejs_min_version: 20
    common_system_bin_path: /usr/local/bin
    common_uv_installer_url: https://astral.sh/uv/install.sh
- role: github_mcp
  servers:
  - name: github-mcp-server
    type: stdio
    lang: go
    args:
    - stdio
    description: GitHub MCP Server - Access GitHub repositories, issues, and pull
      requests
  vars:
    github_mcp_mode: local
    github_mcp_build_repo: https://github.com/github/github-mcp-server.git
    github_mcp_build_repo_branch: main
    github_mcp_build_path: github/build
`;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(mockServerManifest),
    } as any);
    auth.getOwnServiceCredentials.mockResolvedValue({
      token: 'service-token',
    } as any);
    auth.getPluginRequestToken.mockResolvedValue({
      token: 'plugin-token',
    } as any);
  });

  describe('generateEEDefinition functionality', () => {
    it('should generate EE definition with base image only', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(mockWriteFile).toHaveBeenCalled();
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      expect(writeCall).toBeDefined();
      const content = writeCall![1] as string;
      const expectedContent = dedent`---
    version: 3

    images:
      base_image:
        name: 'quay.io/ansible/ee-base:latest'


    additional_build_files:
      - src: ./ansible.cfg
        dest: configs

    additional_build_steps:
      prepend_base:
        - COPY _build/configs/ansible.cfg /etc/ansible/ansible.cfg
      append_final:
        - RUN rm -f /etc/ansible/ansible.cfg\n`;
      expect(content).toEqual(expectedContent);
    });

    it('should generate EE definition with collections', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: [
              { name: 'community.general', version: '1.0.0' },
              { name: 'ansible.netcommon' },
            ],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      const content = writeCall![1] as string;
      const expectedContent = dedent`---
    version: 3

    images:
      base_image:
        name: 'quay.io/ansible/ee-base:latest'

    dependencies:
      galaxy:
        collections:
          - name: community.general
            version: 1.0.0
          - name: ansible.netcommon

    additional_build_files:
      - src: ./ansible.cfg
        dest: configs

    additional_build_steps:
      prepend_base:
        - COPY _build/configs/ansible.cfg /etc/ansible/ansible.cfg
      append_final:
        - RUN rm -f /etc/ansible/ansible.cfg\n`;
      expect(content).toEqual(expectedContent);
    });

    it('should generate EE definition with only Python requirements', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            pythonRequirements: ['requests==2.28.0', 'jinja2>=3.0.0'],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      const content = writeCall![1] as string;
      const expectedContent = dedent`---
    version: 3

    images:
      base_image:
        name: 'quay.io/ansible/ee-base:latest'

    dependencies:
      python:
        - requests==2.28.0
        - jinja2>=3.0.0

    additional_build_files:
      - src: ./ansible.cfg
        dest: configs

    additional_build_steps:
      prepend_base:
        - COPY _build/configs/ansible.cfg /etc/ansible/ansible.cfg
      append_final:
        - RUN rm -f /etc/ansible/ansible.cfg\n`;
      expect(content).toEqual(expectedContent);
    });

    it('should generate EE definition with system packages', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            systemPackages: [
              'libssh-devel [platform:rpm]',
              'gcc-c++ [platform:dpkg]',
              'libffi-devel [platform:base-py3]',
            ],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      const content = writeCall![1] as string;
      const expectedContent = dedent`---
    version: 3

    images:
      base_image:
        name: 'quay.io/ansible/ee-base:latest'

    dependencies:
      system:
        - libssh-devel [platform:rpm]
        - gcc-c++ [platform:dpkg]
        - libffi-devel [platform:base-py3]

    additional_build_files:
      - src: ./ansible.cfg
        dest: configs

    additional_build_steps:
      prepend_base:
        - COPY _build/configs/ansible.cfg /etc/ansible/ansible.cfg
      append_final:
        - RUN rm -f /etc/ansible/ansible.cfg\n`;
      expect(content).toEqual(expectedContent);
    });

    it('should generate EE definition with collection signatures', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: [
              {
                name: 'community.general',
                version: '1.0.0',
                signatures: [
                  'https://examplehost.com/detached_signature.asc',
                  'file:///path/to/local/detached_signature.asc',
                ],
              },
            ],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      const content = writeCall![1] as string;
      const expectedContent = dedent`---
    version: 3

    images:
      base_image:
        name: 'quay.io/ansible/ee-base:latest'

    dependencies:
      galaxy:
        collections:
          - name: community.general
            version: 1.0.0
            signatures:
              - https://examplehost.com/detached_signature.asc
              - file:///path/to/local/detached_signature.asc

    additional_build_files:
      - src: ./ansible.cfg
        dest: configs

    additional_build_steps:
      prepend_base:
        - COPY _build/configs/ansible.cfg /etc/ansible/ansible.cfg
      append_final:
        - RUN rm -f /etc/ansible/ansible.cfg\n`;
      expect(content).toEqual(expectedContent);
    });

    it('should generate EE definition with additional build steps', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            additionalBuildSteps: [
              {
                stepType: 'append_builder',
                commands: ['RUN whoami', 'RUN pwd'],
              },
              {
                stepType: 'prepend_final',
                commands: ['RUN ls -la'],
              },
            ],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      const content = writeCall![1] as string;
      const expectedContent = dedent`---
    version: 3

    images:
      base_image:
        name: 'quay.io/ansible/ee-base:latest'


    additional_build_files:
      - src: ./ansible.cfg
        dest: configs

    additional_build_steps:
      append_builder:
        - RUN whoami
        - RUN pwd
      prepend_final:
        - RUN ls -la
      prepend_base:
        - COPY _build/configs/ansible.cfg /etc/ansible/ansible.cfg
      append_final:
        - RUN rm -f /etc/ansible/ansible.cfg\n`;
      expect(content).toEqual(expectedContent);
    });

    it('should generate EE definition with all inputs provided', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: [
              {
                name: 'community.general',
                version: '1.0.0',
                signatures: [
                  'https://examplehost.com/detached_signature.asc',
                  'file:///path/to/local/detached_signature.asc',
                ],
              },
            ],
            pythonRequirements: ['requests==2.28.0', 'jinja2>=3.0.0'],
            systemPackages: [
              'libssh-devel [platform:rpm]',
              'gcc-c++ [platform:dpkg]',
              'libffi-devel [platform:base-py3]',
            ],
            mcpServers: ['github', 'gitlab'],
            additionalBuildSteps: [
              {
                stepType: 'append_builder',
                commands: ['RUN whoami', 'RUN pwd'],
              },
              {
                stepType: 'prepend_final',
                commands: ['RUN ls -la'],
              },
            ],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      const content = writeCall![1] as string;
      const expectedContent = dedent`---
      version: 3

      images:
        base_image:
          name: 'quay.io/ansible/ee-base:latest'

      dependencies:
        python:
          - requests==2.28.0
          - jinja2>=3.0.0
        system:
          - libssh-devel [platform:rpm]
          - gcc-c++ [platform:dpkg]
          - libffi-devel [platform:base-py3]
        galaxy:
          collections:
            - name: community.general
              version: 1.0.0
              signatures:
                - https://examplehost.com/detached_signature.asc
                - file:///path/to/local/detached_signature.asc
            - name: ansible.mcp_builder
            - name: ansible.mcp

      additional_build_files:
        - src: ./ansible.cfg
          dest: configs
        - src: ./mcp-vars.yaml
          dest: configs

      additional_build_steps:
        append_builder:
          - RUN whoami
          - RUN pwd
        prepend_final:
          - RUN ls -la
        prepend_base:
          - COPY _build/configs/ansible.cfg /etc/ansible/ansible.cfg
          - COPY _build/configs/mcp-vars.yaml /tmp/mcp-vars.yaml
        append_final:
          - RUN ansible-playbook ansible.mcp_builder.install_mcp -e mcp_servers=github,gitlab -e @/tmp/mcp-vars.yaml
          - RUN rm -f /etc/ansible/ansible.cfg /tmp/mcp-vars.yaml\n`;
      expect(content).toEqual(expectedContent);
    });

    it('should generate EE definition with package manager and python interpreter overridden for minimal EE base image', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage:
              'registry.redhat.io/ansible-automation-platform/ee-minimal-rhel8:2.18',
            collections: [
              {
                name: 'amazon.aws',
              },
            ],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      const content = writeCall![1] as string;
      const expectedContent = dedent`---
      version: 3

      images:
        base_image:
          name: 'registry.redhat.io/ansible-automation-platform/ee-minimal-rhel8:2.18'

      dependencies:
        galaxy:
          collections:
            - name: amazon.aws
        python_interpreter:
          python_path: "/usr/bin/python3.11"

      additional_build_files:
        - src: ./ansible.cfg
          dest: configs

      options:
        package_manager_path: /usr/bin/microdnf

      additional_build_steps:
        prepend_base:
          - COPY _build/configs/ansible.cfg /etc/ansible/ansible.cfg
        append_final:
          - RUN rm -f /etc/ansible/ansible.cfg\n`;
      expect(content).toEqual(expectedContent);
    });

    it('should group multiple commands for same step type', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            additionalBuildSteps: [
              {
                stepType: 'append_builder',
                commands: ['RUN echo "first"'],
              },
              {
                stepType: 'append_builder',
                commands: ['RUN echo "second"'],
              },
            ],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      const content = writeCall![1] as string;
      const appendBuilderIndex = content.indexOf('append_builder:');
      const prependFinalIndex = content.indexOf('prepend_final:');
      expect(appendBuilderIndex).toBeGreaterThan(-1);
      // Should only have one append_builder section
      const appendBuilderSection = content.substring(
        appendBuilderIndex,
        prependFinalIndex > -1 ? prependFinalIndex : content.length,
      );
      expect(appendBuilderSection).toContain('RUN echo "first"');
      expect(appendBuilderSection).toContain('RUN echo "second"');
    });
  });

  describe('generateReadme functionality', () => {
    it('should include build instructions in README', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('README.md'),
      );
      const content = writeCall![1] as string;
      expect(content).toContain('ansible-builder build');
      expect(content).toContain('ansible-navigator');
    });
  });

  describe('mergeCollections functionality', () => {
    it('should merge collections from different sources', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: [{ name: 'collection1' }],
            popularCollections: ['collection2', 'collection3'],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      // Check the generated EE definition file content
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      expect(writeCall).toBeDefined();
      const content = writeCall![1] as string;
      const parsed = yaml.load(content) as any;
      const collections = parsed.dependencies?.galaxy?.collections || [];
      expect(collections).toHaveLength(3);
      expect(collections.map((c: any) => c.name)).toContain('collection1');
      expect(collections.map((c: any) => c.name)).toContain('collection2');
      expect(collections.map((c: any) => c.name)).toContain('collection3');
    });

    it('should remove duplicate collections by name', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: [{ name: 'collection1' }],
            popularCollections: ['collection1'],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      // Check the generated EE definition file content
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      const content = writeCall![1] as string;
      const parsed = yaml.load(content) as any;
      const collections = parsed.dependencies?.galaxy?.collections || [];
      expect(collections).toHaveLength(1);
      expect(collections[0].name).toBe('collection1');
    });

    it('should prefer collection without version over versioned one', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: [{ name: 'collection1', version: '1.0.0' }],
            popularCollections: ['collection1'],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      // Check the generated EE definition file content
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      const content = writeCall![1] as string;
      const parsed = yaml.load(content) as any;
      const collections = parsed.dependencies?.galaxy?.collections || [];
      // When a versioned collection exists, it should be kept
      // But if a non-versioned one comes later, it should win
      // The non-versioned one from popularCollections should win
      expect(collections).toHaveLength(1);
      expect(collections[0].name).toBe('collection1');
      // Non-versioned collection should win (no version property)
      expect(collections[0].version).toBeUndefined();
    });

    it('should prefer higher version when both have versions', async () => {
      mockSemverGt.mockImplementation((v1, v2) => {
        if (v1 === '2.0.0' && v2 === '1.0.0') return true;
        return false;
      });

      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: [
              { name: 'collection1', version: '1.0.0' },
              { name: 'collection1', version: '2.0.0' },
            ],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      // Check the generated EE definition file content
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      const content = writeCall![1] as string;
      const parsed = yaml.load(content) as any;
      const collections = parsed.dependencies?.galaxy?.collections || [];
      expect(collections).toHaveLength(1);
      expect(collections[0].version).toBe('2.0.0');
    });

    it('should merge collections from uploaded file', async () => {
      mockParseUploadedFileContent.mockImplementation((dataUrl: string) => {
        if (dataUrl.includes('text/yaml')) {
          return 'collections:\n  - name: collection-from-file\n    version: 1.0.0';
        }
        return '';
      });
      // Use real yaml.load implementation to parse the YAML string
      const realYaml = jest.requireActual('js-yaml');
      mockYamlLoad.mockImplementation(realYaml.load);
      // Use real schema parse implementation
      const realSchemas = jest.requireActual('./helpers/schemas');
      mockCollectionRequirementsSchemaParse.mockImplementation(
        realSchemas.CollectionRequirementsSchema.parse,
      );

      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: [{ name: 'manual-collection' }],
            collectionsFile: 'data:text/yaml;base64,test',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      // Check the generated EE definition file content
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      const content = writeCall![1] as string;
      const parsed = yaml.load(content) as any;
      const collections = parsed.dependencies?.galaxy?.collections || [];
      expect(collections.length).toBeGreaterThanOrEqual(1);
      expect(collections).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'manual-collection' }),
          expect.objectContaining({ name: 'collection-from-file' }),
        ]),
      );
    });
  });

  describe('mergeRequirements functionality', () => {
    it('should merge Python requirements from different sources', async () => {
      mockParseUploadedFileContent.mockImplementation((dataUrl: string) => {
        if (dataUrl.includes('text/plain')) {
          return 'paramiko==5.0.0';
        }
        return '';
      });

      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            pythonRequirements: ['requests==2.28.0'],
            pythonRequirementsFile: 'data:text/plain;base64,paramiko==5.0.0',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      // Check the generated EE definition file content
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      expect(writeCall).toBeDefined();
      const content = writeCall![1] as string;
      const parsed = yaml.load(content) as any;
      const requirements = parsed.dependencies?.python || [];
      expect(requirements).toContain('requests==2.28.0');
      expect(requirements).toContain('paramiko==5.0.0');
    });

    it('should remove duplicate requirements', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            pythonRequirements: ['requests==2.28.0', 'requests==2.28.0'],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      // Check the generated EE definition file content
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      const content = writeCall![1] as string;
      const parsed = yaml.load(content) as any;
      const requirements = parsed.dependencies?.python || [];
      expect(requirements).toHaveLength(1);
      expect(requirements[0]).toBe('requests==2.28.0');
    });
  });

  describe('mergePackages functionality', () => {
    it('should merge system packages from different sources', async () => {
      mockParseUploadedFileContent.mockImplementation((dataUrl: string) => {
        if (dataUrl.includes('text/plain')) {
          return 'curl';
        }
        return '';
      });

      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            systemPackages: ['git'],
            systemPackagesFile: 'data:text/plain;base64,curl',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      // Check the generated EE definition file content
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      expect(writeCall).toBeDefined();
      const content = writeCall![1] as string;
      const parsed = yaml.load(content) as any;
      const packages = parsed.dependencies?.system || [];
      expect(packages).toContain('git');
      expect(packages).toContain('curl');
    });

    it('should remove duplicate packages', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            systemPackages: ['git', 'git'],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      // Check the generated EE definition file content
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      const content = writeCall![1] as string;
      const parsed = yaml.load(content) as any;
      const packages = parsed.dependencies?.system || [];
      expect(packages).toHaveLength(1);
      expect(packages[0]).toBe('git');
    });
  });

  describe('parseTextRequirementsFile functionality', () => {
    it('should parse text requirements file correctly', async () => {
      mockParseUploadedFileContent.mockImplementation((dataUrl: string) => {
        if (dataUrl.includes('text/plain')) {
          return 'requests==2.28.0\njinja2>=3.0.0\n\n# comment line';
        }
        return '';
      });

      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            pythonRequirementsFile: 'data:text/plain;base64,test',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      // Check the generated EE definition file content
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      expect(writeCall).toBeDefined();
      const content = writeCall![1] as string;
      const parsed = yaml.load(content) as any;
      const requirements = parsed.dependencies?.python || [];
      expect(requirements).toContain('requests==2.28.0');
      expect(requirements).toContain('jinja2>=3.0.0');
      // Empty lines and comment lines should be filtered out
      expect(requirements).not.toContain('');
      expect(requirements).not.toContain('# comment line');
    });

    it('should handle empty text requirements file', async () => {
      mockParseUploadedFileContent.mockReturnValue('');

      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            pythonRequirementsFile: 'data:text/plain;base64,',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      // Check the generated EE definition file content
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      const content = writeCall![1] as string;
      const parsed = yaml.load(content) as any;
      const requirements = parsed.dependencies?.python || [];
      expect(requirements).toEqual([]);
    });
  });

  describe('parseCollectionsFile functionality', () => {
    it('should parse valid collections YAML file', async () => {
      mockParseUploadedFileContent.mockImplementation((dataUrl: string) => {
        if (dataUrl.includes('text/yaml')) {
          return 'collections:\n  - name: collection1\n    version: 1.0.0\n  - name: collection2';
        }
        return '';
      });
      // Use real yaml.load implementation to parse the YAML string
      const realYaml = jest.requireActual('js-yaml');
      mockYamlLoad.mockImplementation(realYaml.load);
      // Use real schema parse implementation
      const realSchemas = jest.requireActual('./helpers/schemas');
      mockCollectionRequirementsSchemaParse.mockImplementation(
        realSchemas.CollectionRequirementsSchema.parse,
      );

      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collectionsFile: 'data:text/yaml;base64,test',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(mockYamlLoad).toHaveBeenCalled();
      expect(mockCollectionRequirementsSchemaParse).toHaveBeenCalled();
    });

    it('should handle empty collections file', async () => {
      mockParseUploadedFileContent.mockReturnValue('');

      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collectionsFile: '',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      // Should not throw and should complete successfully
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should throw error for invalid YAML in collections file', async () => {
      mockParseUploadedFileContent.mockReturnValue('invalid: yaml: content: [');
      mockYamlLoad.mockImplementation(() => {
        throw new Error('YAML parse error');
      });

      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collectionsFile: 'data:text/yaml;base64,invalid',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await expect(action.handler(ctx)).rejects.toThrow();
    });

    it('should throw error for invalid schema in collections file', async () => {
      mockParseUploadedFileContent.mockReturnValue('invalid: content');
      mockYamlLoad.mockReturnValue({ invalid: 'content' });
      const zodError = new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'array',
          path: ['collections'],
          message: 'Expected array, received string',
        } as z.ZodIssue,
      ]);
      mockCollectionRequirementsSchemaParse.mockImplementation(() => {
        throw zodError;
      });

      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collectionsFile: 'data:text/yaml;base64,invalid',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await expect(action.handler(ctx)).rejects.toThrow(
        'Invalid collections file structure',
      );
    });
  });

  describe('generateMCPBuilderSteps functionality', () => {
    it('should add MCP collections and build steps when MCP servers are specified', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            mcpServers: ['github_mcp', 'aws_mcp'],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      // Check the generated EE definition file content
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      expect(writeCall).toBeDefined();
      const content = writeCall![1] as string;
      const parsed = yaml.load(content) as any;

      // Verify MCP collections are added
      const collections = parsed.dependencies?.galaxy?.collections || [];
      expect(
        collections.some((c: any) => c.name === 'ansible.mcp_builder'),
      ).toBeTruthy();
      expect(
        collections.some((c: any) => c.name === 'ansible.mcp'),
      ).toBeTruthy();

      // Verify MCP build steps are added
      const buildSteps = parsed.additional_build_steps || {};
      const appendFinalCommands = buildSteps.append_final || [];
      expect(appendFinalCommands).toEqual([
        'RUN ansible-playbook ansible.mcp_builder.install_mcp -e mcp_servers=github_mcp,aws_mcp -e @/tmp/mcp-vars.yaml',
        'RUN rm -f /etc/ansible/ansible.cfg /tmp/mcp-vars.yaml',
      ]);
    });

    it('should append to existing append_builder step', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            mcpServers: ['github_mcp'],
            additionalBuildSteps: [
              {
                stepType: 'append_final',
                commands: ['RUN echo "existing command"'],
              },
            ],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      // Check the generated EE definition file content
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      const content = writeCall![1] as string;
      const parsed = yaml.load(content) as any;
      const buildSteps = parsed.additional_build_steps || {};
      const appendFinalCommands = buildSteps.append_final || [];

      const expectedCommands = [
        'RUN ansible-playbook ansible.mcp_builder.install_mcp -e mcp_servers=github_mcp -e @/tmp/mcp-vars.yaml',
        'RUN echo "existing command"',
        'RUN rm -f /etc/ansible/ansible.cfg /tmp/mcp-vars.yaml',
      ];

      expect(appendFinalCommands).toEqual(expectedCommands);
    });

    it('should not add MCP steps when no MCP servers specified', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            mcpServers: [],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      // Check the generated EE definition file content
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('test-ee.yaml'),
      );
      const content = writeCall![1] as string;
      const parsed = yaml.load(content) as any;
      const collections = parsed.dependencies?.galaxy?.collections || [];
      expect(collections).toEqual([]);

      // Verify no MCP build steps are added
      const buildSteps = parsed.additional_build_steps || {};
      expect(buildSteps.append_builder).toBeUndefined();
    });
  });

  describe('generateMCPVarsContent functionality', () => {
    it('should generate MCP vars content with only common vars when mcpServers contains only servers with empty vars', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            mcpServers: ['aws_ccapi_mcp'],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      // Check that mcp-vars.yaml file was written
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('mcp-vars.yaml'),
      );
      expect(writeCall).toBeDefined();
      const content = writeCall![1] as string;

      // Should include common vars (common is always added internally)
      expect(content).toContain('# vars for common');
      expect(content).toContain('common_mcp_base_path: /opt/mcp');
      expect(content).toContain('common_golang_version: 1.25');
      expect(content).toContain('common_nodejs_min_version: 20');
      expect(content).toContain('common_system_bin_path: /usr/local/bin');
      expect(content).toContain(
        'common_uv_installer_url: https://astral.sh/uv/install.sh',
      );

      // Should not include vars for aws_ccapi_mcp (it has empty vars)
      expect(content).not.toContain('# vars for aws_ccapi_mcp');

      // Check output
      const outputCall = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'mcpVarsContent',
      );
      expect(outputCall).toBeDefined();
      expect(outputCall![1]).toBe(content);
    });

    it('should generate MCP vars content for azure_mcp server', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            mcpServers: ['azure_mcp'],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('mcp-vars.yaml'),
      );
      expect(writeCall).toBeDefined();
      const content = writeCall![1] as string;

      // Should include azure_mcp vars
      expect(content).toContain('# vars for azure_mcp');
      expect(content).toContain('azure_mcp_namespaces:');
      expect(content).toContain('- az');

      // Should also include common vars
      expect(content).toContain('# vars for common');
      expect(content).toContain('common_mcp_base_path: /opt/mcp');
    });

    it('should generate MCP vars content for github_mcp server', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            mcpServers: ['github_mcp'],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('mcp-vars.yaml'),
      );
      expect(writeCall).toBeDefined();
      const content = writeCall![1] as string;

      // Should include github_mcp vars
      expect(content).toContain('# vars for github_mcp');
      expect(content).toContain('github_mcp_mode: local');
      expect(content).toContain(
        'github_mcp_build_repo: https://github.com/github/github-mcp-server.git',
      );
      expect(content).toContain('github_mcp_build_repo_branch: main');
      expect(content).toContain('github_mcp_build_path: github/build');

      // Should also include common vars
      expect(content).toContain('# vars for common');
    });

    it('should not include vars for MCP servers with empty vars', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            mcpServers: ['aws_ccapi_mcp', 'aws_cdk_mcp'],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('mcp-vars.yaml'),
      );
      expect(writeCall).toBeDefined();
      const content = writeCall![1] as string;

      // Should not include vars for aws_ccapi_mcp or aws_cdk_mcp (they have empty vars)
      expect(content).not.toContain('# vars for aws_ccapi_mcp');
      expect(content).not.toContain('# vars for aws_cdk_mcp');

      // Should only include common vars
      expect(content).toContain('# vars for common');
      expect(content).toContain('common_mcp_base_path: /opt/mcp');
    });

    it('should generate MCP vars content for multiple servers with mixed vars', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            mcpServers: ['azure_mcp', 'github_mcp', 'aws_ccapi_mcp'],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('mcp-vars.yaml'),
      );
      expect(writeCall).toBeDefined();
      const content = writeCall![1] as string;

      // Should include vars for azure_mcp
      expect(content).toContain('# vars for azure_mcp');
      expect(content).toContain('azure_mcp_namespaces:');

      // Should include vars for github_mcp
      expect(content).toContain('# vars for github_mcp');
      expect(content).toContain('github_mcp_mode: local');

      // Should not include vars for aws_ccapi_mcp (empty vars)
      expect(content).not.toContain('# vars for aws_ccapi_mcp');

      // Should include common vars
      expect(content).toContain('# vars for common');
      expect(content).toContain('common_mcp_base_path: /opt/mcp');
    });

    it('should generate valid YAML format for MCP vars content', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            mcpServers: ['azure_mcp', 'github_mcp'],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('mcp-vars.yaml'),
      );
      expect(writeCall).toBeDefined();
      const content = writeCall![1] as string;

      // Should start with YAML document marker
      expect(content).toMatch(/^---\n/);

      // Should be valid YAML (can be parsed)
      const parsed = yaml.load(content);
      expect(parsed).toBeDefined();

      // Should end with exactly one newline
      expect(content.endsWith('\n')).toBe(true);
      expect(content.match(/\n$/g)?.length).toBe(1);
    });

    it('should not write mcp-vars.yaml file when no MCP servers are specified', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            mcpServers: [],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      // Should not write mcp-vars.yaml when mcpServers is empty
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('mcp-vars.yaml'),
      );
      // Actually, looking at the code, it seems mcp-vars.yaml is only written if mcpServers.length > 0
      // But generateMCPVarsContent is only called when mcpServers.length > 0
      // So when empty, the file should not be written
      expect(writeCall).toBeUndefined();

      // mcpVarsContent should not be output
      const outputCall = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'mcpVarsContent',
      );
      expect(outputCall).toBeUndefined();
    });

    it('should output mcpVarsContent when MCP servers are specified', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            mcpServers: ['azure_mcp'],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      // Check that mcpVarsContent was output
      const outputCall = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'mcpVarsContent',
      );
      expect(outputCall).toBeDefined();
      const mcpVarsContent = outputCall![1] as string;

      // Verify the content matches what was written to file
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('mcp-vars.yaml'),
      );
      expect(writeCall).toBeDefined();
      expect(mcpVarsContent).toBe(writeCall![1]);
    });

    it('should preserve mcpServers array after generating vars (common should be removed)', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const originalMcpServers = ['azure_mcp', 'github_mcp'];
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            mcpServers: [...originalMcpServers],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('mcp-vars.yaml'),
      );
      expect(writeCall).toBeDefined();
      const content = writeCall![1] as string;

      // Should include vars for both servers and common
      expect(content).toContain('# vars for azure_mcp');
      expect(content).toContain('# vars for github_mcp');
      expect(content).toContain('# vars for common');
    });
  });

  describe('validateEEDefinition functionality', () => {
    it('should validate valid EE definition', async () => {
      const validEEDefinition = {
        version: 3,
        images: { base_image: { name: 'quay.io/ansible/ee-base:latest' } },
      };
      mockYamlLoad.mockReturnValue(validEEDefinition);
      mockEEDefinitionSchemaParse.mockReturnValue(validEEDefinition);

      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(mockEEDefinitionSchemaParse).toHaveBeenCalled();
    });

    it('should throw error for schema validation failure', async () => {
      /*
     The invalid EE definition is just for reference. It is not used in the test.
     It shows an example of what circumstances the schema validation will fail.
      const invalidEEDefinition = {
        version: 3,
        // missing required images field
      };
      */
      const zodError = new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'object',
          path: ['images'],
          message: 'Required',
        } as z.ZodIssue,
      ]);
      mockEEDefinitionSchemaParse.mockImplementation(() => {
        throw zodError;
      });

      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await expect(action.handler(ctx)).rejects.toThrow(
        'Schema validation failed for the generated EE definition:\n- images: Required',
      );
    });
  });

  describe('contextDirName generation', () => {
    it('should generate sanitized directory name from eeFileName', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'My Test EE!',
            baseImage: 'quay.io/ansible/ee-base:latest',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const outputCall = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'contextDirName',
      );
      expect(outputCall).toBeDefined();
      const dirName = outputCall![1];
      expect(dirName).toBe('my-test-ee');
      expect(dirName).toMatch(/^[a-z0-9-_]+$/);
    });

    it('should handle special characters in eeFileName', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'EE@#$%^&*()',
            baseImage: 'quay.io/ansible/ee-base:latest',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const outputCall = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'contextDirName',
      );
      const dirName = outputCall![1];
      expect(dirName).toEqual('ee');
    });
  });

  describe('error handling', () => {
    it('should handle file write errors', async () => {
      mockWriteFile.mockRejectedValueOnce(new Error('Write failed'));

      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await expect(action.handler(ctx)).rejects.toThrow('Write failed');
    });

    it('should handle directory creation errors', async () => {
      mockMkdir.mockRejectedValueOnce(new Error('Mkdir failed'));

      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await expect(action.handler(ctx)).rejects.toThrow('Mkdir failed');
    });
  });

  describe('generateEETemplate functionality', () => {
    it('should generate EE template with minimal inputs', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            eeDescription: 'Test EE Description',
            baseImage: 'quay.io/ansible/ee-base:latest',
            tags: [],
            publishToSCM: true,
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('template.yaml'),
      );
      expect(writeCall).toBeDefined();
      const content = writeCall![1] as string;

      // Verify basic template structure
      expect(content).toContain('apiVersion: scaffolder.backstage.io/v1beta3');
      expect(content).toContain('kind: Template');
      expect(content).toContain('name: test-ee');
      expect(content).toContain('title: test-ee');
      expect(content).toContain('description: Test EE Description');
      expect(content).toContain("ansible.io/saved-template: 'true'");
      expect(content).toContain('type: execution-environment');
    });

    it('should generate EE template with default description when not provided', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            tags: [],
            publishToSCM: true,
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('template.yaml'),
      );
      const content = writeCall![1] as string;
      expect(content).toContain(
        'description: Saved Ansible Execution Environment Definition template',
      );
    });

    it('should generate EE template with collections', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            eeDescription: 'Test EE',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: [
              { name: 'community.general', version: '1.0.0' },
              { name: 'ansible.netcommon' },
            ],
            tags: [],
            publishToSCM: true,
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('template.yaml'),
      );
      const content = writeCall![1] as string;

      // Verify collections are included in the template
      expect(content).toContain(
        'default: [{"name":"community.general","version":"1.0.0"},{"name":"ansible.netcommon"}]',
      );
    });

    it('should generate EE template with Python requirements', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            eeDescription: 'Test EE',
            baseImage: 'quay.io/ansible/ee-base:latest',
            pythonRequirements: ['requests==2.28.0', 'jinja2>=3.0.0'],
            tags: [],
            publishToSCM: true,
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('template.yaml'),
      );
      const content = writeCall![1] as string;

      // Verify Python requirements are included
      expect(content).toContain(
        'default: ["requests==2.28.0","jinja2>=3.0.0"]',
      );
    });

    it('should generate EE template with system packages', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            eeDescription: 'Test EE',
            baseImage: 'quay.io/ansible/ee-base:latest',
            systemPackages: ['git', 'curl'],
            tags: [],
            publishToSCM: true,
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('template.yaml'),
      );
      const content = writeCall![1] as string;

      // Verify system packages are included
      expect(content).toContain('default: ["git","curl"]');
    });

    it('should generate EE template with MCP servers', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            eeDescription: 'Test EE',
            baseImage: 'quay.io/ansible/ee-base:latest',
            mcpServers: ['github', 'aws'],
            tags: [],
            publishToSCM: true,
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('template.yaml'),
      );
      const content = writeCall![1] as string;

      // Verify MCP servers are included
      expect(content).toContain('default: ["github","aws"]');
    });

    it('should generate EE template with additional build steps', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            eeDescription: 'Test EE',
            baseImage: 'quay.io/ansible/ee-base:latest',
            additionalBuildSteps: [
              {
                stepType: 'append_builder',
                commands: ['RUN whoami', 'RUN pwd'],
              },
            ],
            tags: [],
            publishToSCM: true,
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('template.yaml'),
      );
      const content = writeCall![1] as string;

      // Verify additional build steps are included
      expect(content).toContain(
        'default: [{"stepType":"append_builder","commands":["RUN whoami","RUN pwd"]},{"stepType":"prepend_base","commands":["COPY _build/configs/ansible.cfg /etc/ansible/ansible.cfg"]},{"stepType":"append_final","commands":["RUN rm -f /etc/ansible/ansible.cfg"]}]',
      );
    });

    it('should generate EE template with tags', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            eeDescription: 'Test EE',
            baseImage: 'quay.io/ansible/ee-base:latest',
            tags: ['ansible', 'automation', 'ee'],
            publishToSCM: true,
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('template.yaml'),
      );
      const content = writeCall![1] as string;

      // Verify tags are included
      expect(content).toContain('tags: ["ansible","automation","ee"]');
    });

    it('should generate EE template with custom base image', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            eeDescription: 'Test EE',
            baseImage: 'quay.io/ansible/ee-base:latest',
            customBaseImage: 'quay.io/custom/ee-image:latest',
            tags: [],
            publishToSCM: true,
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('template.yaml'),
      );
      const content = writeCall![1] as string;

      // Verify custom base image is included in enum
      expect(content).toContain("- 'quay.io/custom/ee-image:latest'");
      // Verify custom base image is in enumNames
      const lines = content.split('\n');
      const enumIndex = lines.findIndex(line => line.includes('enum:'));
      const enumNamesIndex = lines.findIndex(line =>
        line.includes('enumNames:'),
      );
      expect(enumIndex).toBeGreaterThan(-1);
      expect(enumNamesIndex).toBeGreaterThan(-1);
    });

    it('should generate EE template with all inputs provided', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            eeDescription: 'Complete Test EE',
            baseImage: 'quay.io/ansible/ee-base:latest',
            customBaseImage: 'quay.io/custom/ee:latest',
            collections: [{ name: 'community.general', version: '1.0.0' }],
            pythonRequirements: ['requests==2.28.0'],
            systemPackages: ['git'],
            mcpServers: ['github'],
            additionalBuildSteps: [
              {
                stepType: 'append_builder',
                commands: ['RUN echo "test"'],
              },
            ],
            tags: ['ansible', 'test'],
            publishToSCM: true,
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('template.yaml'),
      );
      const content = writeCall![1] as string;

      // Verify all sections are present
      expect(content).toContain('name: test-ee');
      expect(content).toContain('description: Complete Test EE');
      expect(content).toContain('tags: ["ansible","test"]');
      expect(content).toContain(
        'default: [{"name":"community.general","version":"1.0.0"},{"name":"ansible.mcp_builder"},{"name":"ansible.mcp"}]',
      );
      expect(content).toContain('default: ["requests==2.28.0"]');
      expect(content).toContain('default: ["git"]');
      expect(content).toContain('default: ["github"]');
      expect(content).toContain("- 'quay.io/custom/ee:latest'");
    });

    it('should handle empty arrays in template generation', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            eeDescription: 'Test EE',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: [],
            pythonRequirements: [],
            systemPackages: [],
            mcpServers: [],
            additionalBuildSteps: [],
            tags: [],
            publishToSCM: true,
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('template.yaml'),
      );
      const content = writeCall![1] as string;

      // Verify empty arrays are serialized correctly
      expect(content).toContain('default: []');
      expect(content).toContain('tags: []');
    });

    it('should include all template steps in generated template', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            eeDescription: 'Test EE',
            baseImage: 'quay.io/ansible/ee-base:latest',
            tags: [],
            publishToSCM: true,
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('template.yaml'),
      );
      const content = writeCall![1] as string;

      // Verify key steps are present
      expect(content).toContain('id: create-ee-definition');
      expect(content).toContain('id: create-catalog-info-file');
    });

    it('should include base image enum options in template', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            eeDescription: 'Test EE',
            baseImage: 'quay.io/ansible/ee-base:latest',
            tags: [],
            publishToSCM: true,
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('template.yaml'),
      );
      const content = writeCall![1] as string;

      // Verify default base image enum options are present
      expect(content).toContain(
        "- 'registry.redhat.io/ansible-automation-platform/ee-minimal-rhel8:2.18'",
      );
      expect(content).toContain(
        "- 'registry.redhat.io/ansible-automation-platform/ee-minimal-rhel9:2.18'",
      );
      expect(content).toContain(
        "- 'registry.redhat.io/ansible-automation-platform/ee-minimal-rhel8:2.16'",
      );
      expect(content).toContain(
        "- 'registry.redhat.io/ansible-automation-platform/ee-minimal-rhel9:2.16'",
      );
    });

    it('should include popular collections enum in template', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            eeDescription: 'Test EE',
            baseImage: 'quay.io/ansible/ee-base:latest',
            tags: [],
            publishToSCM: true,
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('template.yaml'),
      );
      const content = writeCall![1] as string;

      // Verify popular collections enum includes expected collections
      expect(content).toContain("- 'ansible.posix'");
      expect(content).toContain("- 'community.general'");
      expect(content).toContain("- 'amazon.aws'");
      expect(content).toContain("- 'azure.azcollection'");
    });

    it('should include MCP servers enum in template', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            eeDescription: 'Test EE',
            baseImage: 'quay.io/ansible/ee-base:latest',
            tags: [],
            publishToSCM: true,
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('template.yaml'),
      );
      const content = writeCall![1] as string;

      // Verify MCP servers enum includes expected options
      expect(content).toContain('- Github');
      expect(content).toContain('- AWS');
      expect(content).toContain('- Azure');
    });

    it('should include all build step types in enum', async () => {
      const action = createEEDefinitionAction({
        frontendUrl: 'http://localhost:3000',
        auth,
        discovery,
      });
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            eeDescription: 'Test EE',
            baseImage: 'quay.io/ansible/ee-base:latest',
            tags: [],
            publishToSCM: true,
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('template.yaml'),
      );
      const content = writeCall![1] as string;

      // Verify all build step types are in enum
      expect(content).toContain("- 'prepend_base'");
      expect(content).toContain("- 'append_base'");
      expect(content).toContain("- 'prepend_galaxy'");
      expect(content).toContain("- 'append_galaxy'");
      expect(content).toContain("- 'prepend_builder'");
      expect(content).toContain("- 'append_builder'");
      expect(content).toContain("- 'prepend_final'");
      expect(content).toContain("- 'append_final'");
    });
  });
});
