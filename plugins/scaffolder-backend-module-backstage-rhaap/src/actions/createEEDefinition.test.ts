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

// Import internal functions for testing (we'll need to export them or test via the action)
// Since we can't easily test private functions, we'll test through the action handler
// But let's create a test file that focuses on testing the logic through the action

describe('createEEDefinition', () => {
  const logger = mockServices.logger.mock();
  const mockWorkspacePath = '/tmp/test-workspace';

  beforeEach(() => {
    jest.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockParseUploadedFileContent.mockReturnValue('');
    // Use real yaml.load implementation by default so validation works
    const realYaml = jest.requireActual('js-yaml');
    mockYamlLoad.mockImplementation(realYaml.load);
    // Use real EEDefinitionSchema.parse implementation by default
    const realSchemas = jest.requireActual('./helpers/schemas');
    mockEEDefinitionSchemaParse.mockImplementation(
      realSchemas.EEDefinitionSchema.parse,
    );
  });

  describe('generateEEDefinition functionality', () => {
    it('should generate EE definition with base image only', async () => {
      const action = createEEDefinitionAction();
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
        name: 'quay.io/ansible/ee-base:latest'\n`;
      expect(content).toEqual(expectedContent);
    });

    it('should generate EE definition with collections', async () => {
      const action = createEEDefinitionAction();
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
          - name: ansible.netcommon\n`;
      expect(content).toEqual(expectedContent);
    });

    it('should generate EE definition with only Python requirements', async () => {
      const action = createEEDefinitionAction();
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
        - jinja2>=3.0.0\n`;
      expect(content).toEqual(expectedContent);
    });

    it('should generate EE definition with system packages', async () => {
      const action = createEEDefinitionAction();
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
        - libffi-devel [platform:base-py3]\n`;
      expect(content).toEqual(expectedContent);
    });

    it('should generate EE definition with collection signatures', async () => {
      const action = createEEDefinitionAction();
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
              - file:///path/to/local/detached_signature.asc\n`;
      expect(content).toEqual(expectedContent);
    });

    it('should generate EE definition with additional build steps', async () => {
      const action = createEEDefinitionAction();
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

    additional_build_steps:
      append_builder:
        - RUN whoami
        - RUN pwd
      prepend_final:
        - RUN ls -la\n`;
      expect(content).toEqual(expectedContent);
    });

    it('should generate EE definition with all inputs provided', async () => {
      const action = createEEDefinitionAction();
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

      additional_build_steps:
        append_builder:
          - RUN whoami
          - RUN pwd
          - RUN ansible-playbook ansible.mcp_builder.install_mcp -e mcp_servers=github_mcp,gitlab_mcp
        prepend_final:
          - RUN ls -la
        append_final:
          - COPY --from=builder /opt/mcp /opt/mcp\n`;
      expect(content).toEqual(expectedContent);
    });

    it('should group multiple commands for same step type', async () => {
      const action = createEEDefinitionAction();
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
    it('should generate README with base image', async () => {
      const action = createEEDefinitionAction();
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
      expect(content).toContain('# Ansible Execution Environment Definition');
      expect(content).toContain(
        '**Base Image**: `quay.io/ansible/ee-base:latest`',
      );
      expect(content).toContain('test-ee.yaml');
    });

    it('should generate README with collections section', async () => {
      const action = createEEDefinitionAction();
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
        call[0].toString().endsWith('README.md'),
      );
      const content = writeCall![1] as string;
      expect(content).toContain('### Ansible Collections (2)');
      expect(content).toContain('name: community.general');
      expect(content).toContain('version: v1.0.0');
      expect(content).toContain('name: ansible.netcommon');
    });

    it('should generate README with Python requirements section', async () => {
      const action = createEEDefinitionAction();
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            pythonRequirements: ['requests==2.28.0'],
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
      expect(content).toContain('### Python Requirements (1)');
      expect(content).toContain('- `requests==2.28.0`');
    });

    it('should generate README with system packages section', async () => {
      const action = createEEDefinitionAction();
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            systemPackages: ['git', 'curl'],
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
      expect(content).toContain('### System Packages (2)');
      expect(content).toContain('- `git`');
      expect(content).toContain('- `curl`');
    });

    it('should generate README with MCP servers section', async () => {
      const action = createEEDefinitionAction();
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            mcpServers: ['github', 'gitlab'],
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
      expect(content).toContain('### MCP Servers (2)');
      expect(content).toContain('- `github`');
      expect(content).toContain('- `gitlab`');
    });

    it('should include build instructions in README', async () => {
      const action = createEEDefinitionAction();
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
      const action = createEEDefinitionAction();
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

      const outputCall = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'collections',
      );
      expect(outputCall).toBeDefined();
      const collections = JSON.parse(outputCall![1]);
      expect(collections).toHaveLength(3);
      expect(collections.map((c: any) => c.name)).toContain('collection1');
      expect(collections.map((c: any) => c.name)).toContain('collection2');
      expect(collections.map((c: any) => c.name)).toContain('collection3');
    });

    it('should remove duplicate collections by name', async () => {
      const action = createEEDefinitionAction();
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

      const outputCall = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'collections',
      );
      const collections = JSON.parse(outputCall![1]);
      expect(collections).toHaveLength(1);
      expect(collections[0].name).toBe('collection1');
    });

    it('should prefer collection without version over versioned one', async () => {
      const action = createEEDefinitionAction();
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

      const outputCall = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'collections',
      );
      const collections = JSON.parse(outputCall![1]);
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

      const action = createEEDefinitionAction();
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

      const outputCall = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'collections',
      );
      const collections = JSON.parse(outputCall![1]);
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

      const action = createEEDefinitionAction();
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

      const outputCall = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'collections',
      );
      const collections = JSON.parse(outputCall![1]);
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
      const action = createEEDefinitionAction();
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            pythonRequirements: ['requests==2.28.0'],
            pythonRequirementsFile: 'data:text/plain;base64,requests==2.29.0',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      mockParseUploadedFileContent.mockImplementation((dataUrl: string) => {
        if (dataUrl.includes('text/plain')) {
          return 'requests==2.29.0';
        }
        return '';
      });

      await action.handler(ctx);

      const outputCall = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'pythonRequirements',
      );
      const requirements = JSON.parse(outputCall![1]);
      expect(requirements).toContain('requests==2.28.0');
      expect(requirements).toContain('requests==2.29.0');
    });

    it('should remove duplicate requirements', async () => {
      const action = createEEDefinitionAction();
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

      const outputCall = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'pythonRequirements',
      );
      const requirements = JSON.parse(outputCall![1]);
      expect(requirements).toHaveLength(1);
      expect(requirements[0]).toBe('requests==2.28.0');
    });
  });

  describe('mergePackages functionality', () => {
    it('should merge system packages from different sources', async () => {
      const action = createEEDefinitionAction();
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

      mockParseUploadedFileContent.mockImplementation((dataUrl: string) => {
        if (dataUrl.includes('text/plain')) {
          return 'curl';
        }
        return '';
      });

      await action.handler(ctx);

      const outputCall = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'systemPackages',
      );
      const packages = JSON.parse(outputCall![1]);
      expect(packages).toContain('git');
      expect(packages).toContain('curl');
    });

    it('should remove duplicate packages', async () => {
      const action = createEEDefinitionAction();
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

      const outputCall = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'systemPackages',
      );
      const packages = JSON.parse(outputCall![1]);
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

      const action = createEEDefinitionAction();
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

      const outputCall = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'pythonRequirements',
      );
      const requirements = JSON.parse(outputCall![1]);
      expect(requirements).toContain('requests==2.28.0');
      expect(requirements).toContain('jinja2>=3.0.0');
      // Empty lines and comment lines should be filtered out
      expect(requirements).not.toContain('');
      expect(requirements).not.toContain('# comment line');
    });

    it('should handle empty text requirements file', async () => {
      mockParseUploadedFileContent.mockReturnValue('');

      const action = createEEDefinitionAction();
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

      const outputCall = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'pythonRequirements',
      );
      const requirements = JSON.parse(outputCall![1]);
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

      const action = createEEDefinitionAction();
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

      const action = createEEDefinitionAction();
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

      const action = createEEDefinitionAction();
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

      const action = createEEDefinitionAction();
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
      const action = createEEDefinitionAction();
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            mcpServers: ['Github', 'AWS'],
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const collectionsOutput = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'collections',
      );
      const collections = JSON.parse(collectionsOutput![1]);
      expect(
        collections.some((c: any) => c.name === 'ansible.mcp_builder'),
      ).toBeTruthy();
      expect(
        collections.some((c: any) => c.name === 'ansible.mcp'),
      ).toBeTruthy();

      const buildStepsOutput = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'additionalBuildSteps',
      );
      const buildSteps = JSON.parse(buildStepsOutput![1]);
      const appendBuilderStep = buildSteps.find(
        (s: any) => s.stepType === 'append_builder',
      );
      expect(appendBuilderStep).toBeDefined();
      expect(
        appendBuilderStep.commands.some((cmd: string) =>
          cmd.includes('ansible-playbook ansible.mcp_builder.install_mcp'),
        ),
      ).toBeTruthy();
      expect(
        appendBuilderStep.commands.some((cmd: string) =>
          cmd.includes('github_mcp,aws_mcp'),
        ),
      ).toBeTruthy();

      const appendFinalStep = buildSteps.find(
        (s: any) => s.stepType === 'append_final',
      );
      expect(appendFinalStep).toBeDefined();
      expect(appendFinalStep.commands).toContain(
        'COPY --from=builder /opt/mcp /opt/mcp',
      );
    });

    it('should append to existing append_builder step', async () => {
      const action = createEEDefinitionAction();
      const ctx = {
        input: {
          values: {
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            mcpServers: ['github'],
            additionalBuildSteps: [
              {
                stepType: 'append_builder',
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

      const buildStepsOutput = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'additionalBuildSteps',
      );
      const buildSteps = JSON.parse(buildStepsOutput![1]);
      const appendBuilderStep = buildSteps.find(
        (s: any) => s.stepType === 'append_builder',
      );

      const expectedCommands = [
        'RUN echo "existing command"',
        'RUN ansible-playbook ansible.mcp_builder.install_mcp -e mcp_servers=github_mcp',
      ];

      expect(appendBuilderStep.commands).toEqual(expectedCommands);
    });

    it('should not add MCP steps when no MCP servers specified', async () => {
      const action = createEEDefinitionAction();
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

      const collectionsOutput = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'collections',
      );
      const collections = JSON.parse(collectionsOutput![1]);
      expect(collections).toEqual([]);
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

      const action = createEEDefinitionAction();
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

      const action = createEEDefinitionAction();
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
      const action = createEEDefinitionAction();
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
      const action = createEEDefinitionAction();
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

      const action = createEEDefinitionAction();
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

      const action = createEEDefinitionAction();
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
});
