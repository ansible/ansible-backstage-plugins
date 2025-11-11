/*
 * Copyright 2025 The Ansible plugin Authors
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

import * as fs from 'fs/promises';
import { mockServices } from '@backstage/backend-test-utils';
import { createEETemplateAction } from './createEETemplate';

const mockMkdir = fs.mkdir as jest.MockedFunction<typeof fs.mkdir>;
const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;

describe('createEETemplate', () => {
  const logger = mockServices.logger.mock();
  const mockWorkspacePath = '/tmp/test-workspace';

  beforeEach(() => {
    jest.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  describe('generateCompleteTemplate functionality', () => {
    it('should generate template with minimal inputs', async () => {
      const action = createEETemplateAction();
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: [],
            templateDescription: 'Test template',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(mockWriteFile).toHaveBeenCalled();
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('template.yaml'),
      );
      expect(writeCall).toBeDefined();
      const content = writeCall![1] as string;
      expect(content).toContain('apiVersion: scaffolder.backstage.io/v1beta3');
      expect(content).toContain('kind: Template');
      expect(content).toContain('name: test-ee');
      expect(content).toContain('title: test-ee');
      expect(content).toContain('description: Test template');
      expect(content).toContain(
        'ansible.io/template-type: execution-environment',
      );
      expect(content).toContain("ansible.io/saved-template: 'true'");
      expect(content).toContain('type: execution-environment');
    });

    it('should generate template with default description when not provided', async () => {
      const action = createEETemplateAction();
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: [],
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

    it('should generate template with base image enum options', async () => {
      const action = createEETemplateAction();
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: [],
            templateDescription: 'Test template',
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
      expect(content).toContain("default: 'quay.io/ansible/ee-base:latest'");
      expect(content).toContain(
        "- 'registry.access.redhat.com/ubi9/python-311:latest'",
      );
      expect(content).toContain(
        "- 'registry.redhat.io/ansible-automation-platform-25/ee-minimal-rhel9:latest'",
      );
      // TO-DO: should change this when the custom UI component is ready
      expect(content).toContain('ui:widget: radio');
    });

    it('should include custom base image in enum when provided', async () => {
      const action = createEETemplateAction();
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            customBaseImage: 'quay.io/custom/ee:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: [],
            templateDescription: 'Test template',
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
      expect(content).toContain("- 'quay.io/custom/ee:latest'");
    });

    it('should generate template with collections parameter', async () => {
      const action = createEETemplateAction();
      const collectionsJson = JSON.stringify([
        { name: 'community.general', version: '1.0.0' },
        { name: 'ansible.netcommon' },
      ]);
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: collectionsJson,
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: [],
            templateDescription: 'Test template',
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
      expect(content).toContain('title: Collections');
      expect(content).toContain(`default: ${collectionsJson}`);
      expect(content).toContain('popularCollections:');
      expect(content).toContain('collectionsFile:');
      expect(content).toContain('specifyRequirements:');
    });

    it('should generate template with Python requirements parameter', async () => {
      const action = createEETemplateAction();
      const requirementsJson = JSON.stringify([
        'requests==2.28.0',
        'jinja2>=3.0.0',
      ]);
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: requirementsJson,
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: [],
            templateDescription: 'Test template',
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
      expect(content).toContain('title: Python Requirements');
      expect(content).toContain(`default: ${requirementsJson}`);
      expect(content).toContain('pythonRequirementsFile:');
    });

    it('should generate template with system packages parameter', async () => {
      const action = createEETemplateAction();
      const packagesJson = JSON.stringify([
        'libssh-devel [platform:rpm]',
        'gcc-c++ [platform:dpkg]',
      ]);
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: packagesJson,
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: [],
            templateDescription: 'Test template',
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
      expect(content).toContain('title: System Packages');
      expect(content).toContain(`default: ${packagesJson}`);
      expect(content).toContain('systemPackagesFile:');
    });

    it('should generate template with MCP servers parameter', async () => {
      const action = createEETemplateAction();
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: ['Github', 'AWS'],
            additionalBuildSteps: '[]',
            tags: [],
            templateDescription: 'Test template',
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
      expect(content).toContain('title: MCP servers');
      expect(content).toContain('default: ["Github","AWS"]');
      expect(content).toContain('enum:');
      expect(content).toContain('- Github');
      expect(content).toContain('- AWS');
      expect(content).toContain('- Azure');
    });

    it('should generate template with additional build steps parameter', async () => {
      const action = createEETemplateAction();
      const buildStepsJson = JSON.stringify([
        {
          stepType: 'append_builder',
          commands: ['RUN whoami', 'RUN pwd'],
        },
        {
          stepType: 'prepend_final',
          commands: ['RUN ls -la'],
        },
      ]);
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: buildStepsJson,
            tags: [],
            templateDescription: 'Test template',
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
      expect(content).toContain('title: Additional Build Steps');
      expect(content).toContain(`default: ${buildStepsJson}`);
      expect(content).toContain('stepType:');
      expect(content).toContain('commands:');
      expect(content).toContain('prepend_base');
      expect(content).toContain('append_base');
      expect(content).toContain('prepend_galaxy');
      expect(content).toContain('append_galaxy');
      expect(content).toContain('prepend_builder');
      expect(content).toContain('append_builder');
      expect(content).toContain('prepend_final');
      expect(content).toContain('append_final');
    });

    it('should generate template with tags parameter', async () => {
      const action = createEETemplateAction();
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: ['ansible', 'execution-environment', 'automation'],
            templateDescription: 'Test template',
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
        'tags: ["ansible","execution-environment","automation"]',
      );
      expect(content).toContain(
        'default: ["ansible","execution-environment","automation"]',
      );
    });

    it('should generate template with all parameters', async () => {
      const action = createEETemplateAction();
      const collectionsJson = JSON.stringify([
        { name: 'community.general', version: '1.0.0' },
      ]);
      const requirementsJson = JSON.stringify(['requests==2.28.0']);
      const packagesJson = JSON.stringify(['libssh-devel [platform:rpm]']);
      const buildStepsJson = JSON.stringify([
        {
          stepType: 'append_builder',
          commands: ['RUN whoami'],
        },
      ]);
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            customBaseImage: 'quay.io/custom/ee:latest',
            collections: collectionsJson,
            pythonRequirements: requirementsJson,
            systemPackages: packagesJson,
            mcpServers: ['Github', 'AWS'],
            additionalBuildSteps: buildStepsJson,
            tags: ['ansible', 'ee'],
            templateDescription: 'Complete test template',
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
      expect(content).toContain('name: test-ee');
      expect(content).toContain('description: Complete test template');
      expect(content).toContain('tags: ["ansible","ee"]');
      expect(content).toContain("- 'quay.io/custom/ee:latest'");
      expect(content).toContain(`default: ${collectionsJson}`);
      expect(content).toContain(`default: ${requirementsJson}`);
      expect(content).toContain(`default: ${packagesJson}`);
      expect(content).toContain('default: ["Github","AWS"]');
      expect(content).toContain(`default: ${buildStepsJson}`);
    });

    it('should generate template with steps section', async () => {
      const action = createEETemplateAction();
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: [],
            templateDescription: 'Test template',
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
      expect(content).toContain('steps:');
      expect(content).toContain('id: create-ee-definition');
      expect(content).toContain('action: ansible:ee:create-definition');
      expect(content).toContain('id: create-template');
      expect(content).toContain('action: ansible:ee:create-template');
      expect(content).toContain('id: prepare-publish');
      expect(content).toContain('action: ansible:prepare:publish');
      expect(content).toContain('id: create-catalog-info');
      expect(content).toContain('action: ansible:ee:create-catalog-info');
    });

    it('should generate template with output section', async () => {
      const action = createEETemplateAction();
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: [],
            templateDescription: 'Test template',
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
      expect(content).toContain('output:');
      expect(content).toContain('links:');
      expect(content).toContain('text:');
      expect(content).toContain('Next Steps');
    });
  });

  describe('handler functionality', () => {
    it('should create directory if it does not exist', async () => {
      const action = createEETemplateAction();
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: [],
            templateDescription: 'Test template',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(mockMkdir).toHaveBeenCalledWith(`${mockWorkspacePath}/test-ee`, {
        recursive: true,
      });
    });

    it('should write template file to correct path', async () => {
      const action = createEETemplateAction();
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: [],
            templateDescription: 'Test template',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(mockWriteFile).toHaveBeenCalled();
      const writeCall = mockWriteFile.mock.calls[0];
      expect(writeCall[0]).toContain('template.yaml');
      expect(writeCall[0]).toContain('test-ee');
    });

    it('should output template content', async () => {
      const action = createEETemplateAction();
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: [],
            templateDescription: 'Test template',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(ctx.output).toHaveBeenCalledWith(
        'templateContent',
        expect.any(String),
      );
      const outputCall = ctx.output.mock.calls.find(
        (call: any[]) => call[0] === 'templateContent',
      );
      expect(outputCall).toBeDefined();
      expect(outputCall![1]).toContain(
        'apiVersion: scaffolder.backstage.io/v1beta3',
      );
      expect(outputCall![1]).toContain('kind: Template');
    });

    it('should log success message', async () => {
      const action = createEETemplateAction();
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: [],
            templateDescription: 'Test template',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Template created successfully'),
      );
    });
  });

  describe('error handling', () => {
    it('should handle file write errors', async () => {
      mockWriteFile.mockRejectedValueOnce(new Error('Write failed'));

      const action = createEETemplateAction();
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: [],
            templateDescription: 'Test template',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await expect(action.handler(ctx)).rejects.toThrow(
        'Failed when creating template.yaml: Write failed',
      );
    });

    it('should handle directory creation errors', async () => {
      mockMkdir.mockRejectedValueOnce(new Error('Mkdir failed'));

      const action = createEETemplateAction();
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: [],
            templateDescription: 'Test template',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      await expect(action.handler(ctx)).rejects.toThrow(
        'Failed when creating template.yaml: Mkdir failed',
      );
    });

    it('should handle errors during template generation', async () => {
      const action = createEETemplateAction();
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: [],
            templateDescription: 'Test template',
          },
        },
        logger,
        workspacePath: mockWorkspacePath,
        output: jest.fn(),
      } as any;

      // Mock JSON.stringify to throw an error
      const originalStringify = JSON.stringify;
      JSON.stringify = jest.fn(() => {
        throw new Error('JSON stringify failed');
      });

      await expect(action.handler(ctx)).rejects.toThrow(
        'Failed when creating template.yaml: JSON stringify failed',
      );

      // Restore original
      JSON.stringify = originalStringify;
    });
  });

  describe('template structure validation', () => {
    it('should generate valid YAML structure', async () => {
      const action = createEETemplateAction();
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: [],
            templateDescription: 'Test template',
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

      // Validate basic structure
      expect(content).toMatch(/^apiVersion:/m);
      expect(content).toMatch(/^kind: Template$/m);
      expect(content).toMatch(/^metadata:/m);
      expect(content).toMatch(/^spec:/m);
      expect(content).toMatch(/^ {2}parameters:/m);
      expect(content).toMatch(/^ {2}steps:/m);
      expect(content).toMatch(/^ {2}output:/m);
    });

    it('should include all required metadata fields', async () => {
      const action = createEETemplateAction();
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: ['tag1', 'tag2'],
            templateDescription: 'Test template',
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

      // Check metadata structure
      expect(content).toMatch(/metadata:/m);
      expect(content).toMatch(/^ {2}name: test-ee/m);
      expect(content).toMatch(/^ {2}title: test-ee/m);
      expect(content).toMatch(/^ {2}description: Test template/m);
      expect(content).toMatch(/^ {2}annotations:/m);
      expect(content).toMatch(
        /^ {4}ansible.io\/template-type: execution-environment/m,
      );
      expect(content).toMatch(/^ {4}ansible.io\/saved-template: 'true'/m);
      expect(content).toMatch(/^ {2}tags:/m);
    });

    it('should include all required spec fields', async () => {
      const action = createEETemplateAction();
      const ctx = {
        input: {
          values: {
            contextDirName: 'test-ee',
            eeFileName: 'test-ee',
            baseImage: 'quay.io/ansible/ee-base:latest',
            collections: '[]',
            pythonRequirements: '[]',
            systemPackages: '[]',
            mcpServers: [],
            additionalBuildSteps: '[]',
            tags: [],
            templateDescription: 'Test template',
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

      // Check spec structure
      expect(content).toMatch(/spec:/m);
      expect(content).toMatch(/^ {2}type: execution-environment/m);
      expect(content).toMatch(/^ {2}parameters:/m);
      expect(content).toMatch(/^ {2}steps:/m);
      expect(content).toMatch(/^ {2}output:/m);
    });
  });
});
