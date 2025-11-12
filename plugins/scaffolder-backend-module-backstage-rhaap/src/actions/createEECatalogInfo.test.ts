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

jest.mock('crypto', () => ({
  randomBytes: jest.fn(),
}));

// Mock global fetch
global.fetch = jest.fn();

import * as fs from 'fs/promises';
import { randomBytes } from 'crypto';
import { mockServices } from '@backstage/backend-test-utils';
import { createEECatalogInfoAction } from './createEECatalogInfo';

const mockMkdir = fs.mkdir as jest.MockedFunction<typeof fs.mkdir>;
const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
const mockRandomBytes = randomBytes as jest.MockedFunction<
  (size: number) => Buffer
>;
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('createEECatalogInfo', () => {
  const logger = mockServices.logger.mock();
  const auth = mockServices.auth.mock();
  const discovery = mockServices.discovery.mock();
  const mockWorkspacePath = '/tmp/test-workspace';

  beforeEach(() => {
    jest.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockRandomBytes.mockReturnValue(Buffer.from('abcd', 'hex'));
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(''),
    } as any);
    discovery.getBaseUrl.mockResolvedValue('http://localhost:7007/api/catalog');
    auth.getOwnServiceCredentials.mockResolvedValue({
      token: 'service-token',
    } as any);
    auth.getPluginRequestToken.mockResolvedValue({
      token: 'plugin-token',
    } as any);
  });

  describe('generateCatalogInfoContent functionality', () => {
    it('should generate catalog-info with all required fields', async () => {
      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'test-ee',
          description: 'Test Execution Environment',
          tags: ['ansible', 'execution-environment'],
          owner: 'user:testuser',
          repoUrl: 'https://github.com/org/repo',
          publishToSCM: true,
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(mockWriteFile).toHaveBeenCalled();
      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('catalog-info.yaml'),
      );
      expect(writeCall).toBeDefined();
      const content = writeCall![1] as string;
      const expectedContent = `apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: test-ee
  description: Test Execution Environment
  tags:
    - ansible
    - execution-environment
  annotations:
    backstage.io/techdocs-ref: dir:.
    backstage.io/managed-by-location: https://github.com/org/repo
spec:
  type: execution-environment
  owner: user:testuser
  lifecycle: production
`;
      expect(content).toEqual(expectedContent);
    });

    it('should normalize repoUrl with query parameters', async () => {
      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'test-ee',
          description: 'Test Execution Environment',
          tags: ['ansible'],
          repoUrl: 'https://github.com?owner=org&repo=test-repo',
          publishToSCM: true,
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('catalog-info.yaml'),
      );
      const content = writeCall![1] as string;
      expect(content).toContain(
        'backstage.io/managed-by-location: https://github.com/org/test-repo',
      );
    });

    it('should handle repoUrl without query parameters', async () => {
      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'test-ee',
          description: 'Test Execution Environment',
          tags: ['ansible'],
          repoUrl: 'https://github.com/org/repo',
          publishToSCM: true,
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('catalog-info.yaml'),
      );
      const content = writeCall![1] as string;
      expect(content).toContain(
        'backstage.io/managed-by-location: https://github.com/org/repo',
      );
    });

    it('should handle invalid repoUrl gracefully', async () => {
      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'test-ee',
          description: 'Test Execution Environment',
          tags: ['ansible'],
          repoUrl: 'invalid-url?',
          publishToSCM: true,
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('catalog-info.yaml'),
      );
      const content = writeCall![1] as string;
      // Should fallback to empty string on error
      expect(content).toContain('backstage.io/managed-by-location: ');
    });

    it('should format tags correctly', async () => {
      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'test-ee',
          description: 'Test Execution Environment',
          tags: ['ansible', 'execution-environment', 'automation'],
          repoUrl: 'https://github.com/org/repo',
          publishToSCM: true,
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('catalog-info.yaml'),
      );
      const content = writeCall![1] as string;

      expect(content).toContain(
        '  tags:\n    - ansible\n    - execution-environment\n    - automation',
      );
    });

    it('should handle empty tags array', async () => {
      // EE components should have at least one tag, but it's not enforced by the schema.
      // Users can still create components without the 'execution-environment' tag
      // but those will not be visible in the catalog.
      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'test-ee',
          description: 'Test Execution Environment',
          tags: [],
          repoUrl: 'https://github.com/org/repo',
          publishToSCM: true,
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('catalog-info.yaml'),
      );
      const content = writeCall![1] as string;
      expect(content).toContain('  tags:');
      // Should have tags section but no items
      const tagsIndex = content.indexOf('  tags:');
      const annotationsIndex = content.indexOf('  annotations:');
      const tagsSection = content.substring(tagsIndex, annotationsIndex);
      expect(
        tagsSection.split('\n').filter(l => l.trim().startsWith('-')),
      ).toHaveLength(0);
    });

    it('should use user ref as owner when provided', async () => {
      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'test-ee',
          description: 'Test Execution Environment',
          tags: ['ansible'],
          repoUrl: 'https://github.com/org/repo',
          publishToSCM: true,
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:john.doe' },
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('catalog-info.yaml'),
      );
      const content = writeCall![1] as string;
      expect(content).toContain('  owner: user:john.doe');
    });

    it('should use empty string as owner when user ref not provided', async () => {
      // ideally should not happen, but just in case
      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'test-ee',
          description: 'Test Execution Environment',
          tags: ['ansible'],
          repoUrl: 'https://github.com/org/repo',
          publishToSCM: true,
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: undefined,
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const writeCall = mockWriteFile.mock.calls.find((call: any[]) =>
        call[0].toString().endsWith('catalog-info.yaml'),
      );
      const content = writeCall![1] as string;
      expect(content).toContain('  owner: ');
    });
  });

  describe('generateDynamicCatalogEntity functionality', () => {
    it('should generate dynamic catalog entity with all fields', async () => {
      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'TestEE',
          description: 'Test Execution Environment',
          tags: ['ansible', 'ee'],
          eeDefinitionContent:
            'version: 3\nimages:\n  base_image:\n    name: quay.io/ansible/ee-base:latest',
          readmeContent: '# Test EE\nThis is a test execution environment.',
          publishToSCM: false,
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(mockFetch).toHaveBeenCalled();
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toBe(
        'http://localhost:7007/api/catalog/aap/register_ee',
      );
      expect(fetchCall[1]?.method).toBe('POST');
      expect(fetchCall[1]?.headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer plugin-token',
      });

      const body = JSON.parse(fetchCall[1]?.body as string);
      const expectedBodyEntity = {
        entity: {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: {
            name: 'TestEE',
            title: 'TestEE',
            description: 'Test Execution Environment',
            tags: ['ansible', 'ee'],
            annotations: {
              'ansible.io/download-experience': 'true',
              'backstage.io/managed-by-location': 'url:127.0.0.1',
              'backstage.io/managed-by-origin-location': 'url:127.0.0.1',
            },
          },
          spec: {
            type: 'execution-environment',
            lifecycle: 'production',
            owner: 'user:testuser',
            definition:
              'version: 3\nimages:\n  base_image:\n    name: quay.io/ansible/ee-base:latest',
            readme: '# Test EE\nThis is a test execution environment.',
          },
        },
      };
      expect(body).toEqual(expectedBodyEntity);
    });

    it('should lowercase component name in entity name', async () => {
      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'MyCustomEE',
          description: 'Test Execution Environment',
          tags: ['ansible'],
          eeDefinitionContent: 'version: 3',
          readmeContent: '# Test',
          publishToSCM: false,
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.entity.metadata.name).toBe('MyCustomEE');
      expect(body.entity.metadata.title).toBe('MyCustomEE');
    });

    it('should include all required annotations', async () => {
      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'TestEE',
          description: 'Test Execution Environment',
          tags: ['ansible'],
          eeDefinitionContent: 'version: 3',
          readmeContent: '# Test',
          publishToSCM: false,
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.entity.metadata.annotations).toEqual({
        'backstage.io/managed-by-location': 'url:127.0.0.1',
        'backstage.io/managed-by-origin-location': 'url:127.0.0.1',
        'ansible.io/download-experience': 'true',
      });
    });
  });

  describe('handler functionality - publishToSCM: true', () => {
    it('should create directory and write catalog-info.yaml when publishToSCM is true', async () => {
      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'test-ee',
          description: 'Test Execution Environment',
          tags: ['ansible'],
          repoUrl: 'https://github.com/org/repo',
          publishToSCM: true,
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(mockMkdir).toHaveBeenCalledWith(`${mockWorkspacePath}/test-ee`, {
        recursive: true,
      });
      expect(mockWriteFile).toHaveBeenCalledWith(
        `${mockWorkspacePath}/test-ee/catalog-info.yaml`,
        expect.any(String),
      );
      expect(ctx.output).toHaveBeenCalledWith(
        'catalogInfoContent',
        expect.any(String),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Created catalog-info.yaml'),
      );
    });

    it('should not call catalog API when publishToSCM is true', async () => {
      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'test-ee',
          description: 'Test Execution Environment',
          tags: ['ansible'],
          repoUrl: 'https://github.com/org/repo',
          publishToSCM: true,
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(discovery.getBaseUrl).not.toHaveBeenCalled();
      expect(auth.getPluginRequestToken).not.toHaveBeenCalled();
    });
  });

  describe('handler functionality - publishToSCM: false', () => {
    it('should register entity with catalog API when publishToSCM is false', async () => {
      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'test-ee',
          description: 'Test Execution Environment',
          tags: ['ansible'],
          eeDefinitionContent: 'version: 3',
          readmeContent: '# Test',
          publishToSCM: false,
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(discovery.getBaseUrl).toHaveBeenCalledWith('catalog');
      expect(auth.getOwnServiceCredentials).toHaveBeenCalled();
      expect(auth.getPluginRequestToken).toHaveBeenCalledWith({
        onBehalfOf: { token: 'service-token' },
        targetPluginId: 'catalog',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:7007/api/catalog/aap/register_ee',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer plugin-token',
          }),
        }),
      );
    });

    it('should not create files when publishToSCM is false', async () => {
      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'test-ee',
          description: 'Test Execution Environment',
          tags: ['ansible'],
          eeDefinitionContent: 'version: 3',
          readmeContent: '# Test',
          publishToSCM: false,
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await action.handler(ctx);

      expect(mockMkdir).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should throw error when catalog API registration fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Internal Server Error'),
      } as any);

      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'test-ee',
          description: 'Test Execution Environment',
          tags: ['ansible'],
          eeDefinitionContent: 'version: 3',
          readmeContent: '# Test',
          publishToSCM: false,
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await expect(action.handler(ctx)).rejects.toThrow(
        'Failed to register EE definition: Internal Server Error',
      );
    });

    it('should handle catalog API error response with error text', async () => {
      const errorText = 'Validation failed: Entity already exists';
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue(errorText),
      } as any);

      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'test-ee',
          description: 'Test Execution Environment',
          tags: ['ansible'],
          eeDefinitionContent: 'version: 3',
          readmeContent: '# Test',
          publishToSCM: false,
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await expect(action.handler(ctx)).rejects.toThrow(
        `Failed to register EE definition: ${errorText}`,
      );
    });
  });

  describe('error handling', () => {
    it('should handle directory creation errors', async () => {
      mockMkdir.mockRejectedValueOnce(new Error('Permission denied'));

      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'test-ee',
          description: 'Test Execution Environment',
          tags: ['ansible'],
          repoUrl: 'https://github.com/org/repo',
          publishToSCM: true,
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await expect(action.handler(ctx)).rejects.toThrow('Permission denied');
    });

    it('should handle file write errors', async () => {
      mockWriteFile.mockRejectedValueOnce(new Error('Disk full'));

      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'test-ee',
          description: 'Test Execution Environment',
          tags: ['ansible'],
          repoUrl: 'https://github.com/org/repo',
          publishToSCM: true,
          contextDirName: 'test-ee',
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await expect(action.handler(ctx)).rejects.toThrow('Disk full');
    });

    it('should handle discovery service errors', async () => {
      discovery.getBaseUrl.mockRejectedValueOnce(
        new Error('Discovery service unavailable'),
      );

      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'test-ee',
          description: 'Test Execution Environment',
          tags: ['ansible'],
          eeDefinitionContent: 'version: 3',
          readmeContent: '# Test',
          publishToSCM: false,
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await expect(action.handler(ctx)).rejects.toThrow(
        'Discovery service unavailable',
      );
    });

    it('should handle auth service errors', async () => {
      auth.getOwnServiceCredentials.mockRejectedValueOnce(
        new Error('Auth service error'),
      );

      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'test-ee',
          description: 'Test Execution Environment',
          tags: ['ansible'],
          eeDefinitionContent: 'version: 3',
          readmeContent: '# Test',
          publishToSCM: false,
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await expect(action.handler(ctx)).rejects.toThrow('Auth service error');
    });

    it('should handle fetch network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const action = createEECatalogInfoAction({ auth, discovery });
      const ctx = {
        input: {
          componentName: 'test-ee',
          description: 'Test Execution Environment',
          tags: ['ansible'],
          eeDefinitionContent: 'version: 3',
          readmeContent: '# Test',
          publishToSCM: false,
        },
        logger,
        workspacePath: mockWorkspacePath,
        user: { ref: 'user:testuser' },
        output: jest.fn(),
      } as any;

      await expect(action.handler(ctx)).rejects.toThrow('Network error');
    });
  });
});
