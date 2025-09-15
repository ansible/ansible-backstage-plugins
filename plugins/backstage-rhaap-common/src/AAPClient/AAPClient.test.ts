import { Config } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';
import { AAPClient } from './AAPClient';
import { fetch } from 'undici';
import { AnsibleConfig } from '../types';
import { mockJobTemplateResponse, mockSurveyResponse } from './mockData';

jest.mock('undici', () => ({
  Agent: jest.fn(),
  fetch: jest.fn(),
}));

jest.mock('@backstage/integration', () => ({
  ScmIntegrations: {
    fromConfig: jest.fn(() => ({
      github: {
        list: jest.fn(() => [
          {
            config: {
              host: 'github.com',
              token: 'test-token',
            },
          },
        ]),
      },
      gitlab: {
        list: jest.fn(() => [
          {
            config: {
              host: 'gitlab.com',
              token: 'test-token',
            },
          },
        ]),
      },
    })),
  },
}));

describe('AAPClient', () => {
  let client: AAPClient;
  let mockConfig: Config;
  let mockLogger: LoggerService;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    const mockAnsibleConfig: AnsibleConfig = {
      analytics: {
        enabled: false,
      },
      devSpaces: {
        baseUrl: 'https://devspaces.example.com',
      },
      automationHub: {
        baseUrl: 'https://automationhub.example.com',
      },
      rhaap: {
        baseUrl: 'https://test.example.com',
        token: 'test-token',
        checkSSL: true,
        : {
          type: 'file',
          target: 'test-target',
          gitBranch: 'main',
          gitUser: 'test-user',
          gitEmail: 'test@example.com',
        },
      },
      githubIntegration: {
        host: 'github.com',
        token: 'test-token',
      },
      creatorService: {
        baseUrl: 'localhost',
        port: '8000',
      },
    };

    const mockCatalogRhaapConfig = {
      keys: jest.fn().mockReturnValue(['development']),
      getConfig: jest.fn().mockImplementation((key: string) => {
        if (key === 'development') {
          return {
            getString: jest.fn().mockImplementation((path: string) => {
              if (path === 'orgs') {
                return 'TestOrg';
              }
              throw new Error(`No value for ${path}`);
            }),
            getStringArray: jest.fn().mockImplementation((path: string) => {
              if (path === 'orgs') {
                return ['TestOrg'];
              }
              throw new Error(`No value for ${path}`);
            }),
            getOptionalBoolean: jest.fn().mockReturnValue(false),
            getOptionalStringArray: jest.fn().mockReturnValue([]),
          };
        }
        throw new Error(`No config for key ${key}`);
      }),
    };

    mockConfig = {
      getOptionalConfig: jest.fn().mockImplementation((path: string) => {
        if (path === 'catalog.providers.rhaap') {
          return mockCatalogRhaapConfig;
        }
        return mockAnsibleConfig;
      }),
      getOptionalString: jest.fn().mockImplementation((path: string) => {
        const paths: Record<string, string> = {
          'ansible.rhaap.token': 'test-token',
          'ansible.rhaap.baseUrl': 'https://test.example.com',
          'ansible.rhaap..type': 'file',
          'ansible.rhaap..target': 'test-target',
          'ansible.rhaap..gitBranch': 'main',
          'ansible.rhaap..gitUser': 'test-user',
          'ansible.rhaap..gitEmail': 'test@example.com',
          'ansible.creatorService.baseUrl': 'localhost',
          'ansible.creatorService.port': '8000',
          'catalog.providers.rhaap.development.orgs': 'TestOrg',
          'catalog.providers.rhaap.production.orgs': 'TestOrg',
        };
        return paths[path] || '';
      }),
      getString: jest.fn().mockImplementation((path: string) => {
        const paths: Record<string, string> = {
          'catalog.providers.rhaap.development.orgs': 'TestOrg',
          'catalog.providers.rhaap.production.orgs': 'TestOrg',
          'ansible.rhaap.token': 'test-token',
          'ansible.rhaap.baseUrl': 'https://test.example.com',
        };
        if (!paths[path]) {
          throw new Error(`No value found for config key: ${path}`);
        }
        return paths[path];
      }),
      getConfig: jest.fn().mockImplementation((key: string) => {
        if (key === 'ansible') {
          return {
            getOptionalString: jest.fn().mockImplementation((path: string) => {
              const paths: Record<string, string> = {
                'rhaap.baseUrl': 'https://test.example.com',
                'rhaap.token': 'test-token',
                'rhaap..type': 'file',
                'rhaap..target': 'test-target',
                'rhaap..gitBranch': 'main',
                'rhaap..gitUser': 'test-user',
                'rhaap..gitEmail': 'test@example.com',
                'creatorService.baseUrl': 'localhost',
                'creatorService.port': '8000',
              };
              return paths[path];
            }),
            getOptionalBoolean: jest.fn().mockImplementation((path: string) => {
              const paths: Record<string, boolean> = {
                'analytics.enabled': false,
                'rhaap.checkSSL': true,
              };
              return paths[path];
            }),
            has: jest.fn().mockImplementation((path: string) => {
              return path === 'creatorService';
            }),
            getConfig: jest.fn().mockImplementation((nestedKey: string) => {
              if (nestedKey === 'rhaap') {
                return {
                  getString: jest
                    .fn()
                    .mockReturnValue('https://test.example.com'),
                  getOptionalString: jest.fn(),
                  getOptionalBoolean: jest.fn().mockReturnValue(true),
                  has: jest.fn().mockReturnValue(true),
                };
              }
              return {};
            }),
          };
        }
        if (
          key ===
            'catalog.providers.rhaap.development.sync.orgsUsersTeams.schedule' ||
          key ===
            'catalog.providers.rhaap.production.sync.orgsUsersTeams.schedule'
        ) {
          const scheduleConfig = {
            get: jest.fn().mockImplementation((scheduleKey: string) => {
              if (scheduleKey === 'frequency') {
                return { hours: 12 };
              }
              if (scheduleKey === 'timeout') {
                return { minutes: 30 };
              }
              return undefined;
            }),
            getOptional: jest.fn().mockImplementation((scheduleKey: string) => {
              if (scheduleKey === 'frequency') {
                return { hours: 12 };
              }
              if (scheduleKey === 'timeout') {
                return { minutes: 30 };
              }
              return undefined;
            }),
            getOptionalString: jest
              .fn()
              .mockImplementation((scheduleKey: string) => {
                if (scheduleKey === 'frequency') {
                  return '12h';
                }
                if (scheduleKey === 'timeout') {
                  return '30m';
                }
                return undefined;
              }),
            getConfig: jest.fn().mockImplementation((scheduleKey: string) => {
              if (scheduleKey === 'frequency' || scheduleKey === 'timeout') {
                return {
                  get: jest.fn().mockImplementation((durationKey: string) => {
                    if (scheduleKey === 'frequency') {
                      return durationKey === 'hours' ? 12 : undefined;
                    }
                    if (scheduleKey === 'timeout') {
                      return durationKey === 'minutes' ? 30 : undefined;
                    }
                    return undefined;
                  }),
                  getOptional: jest
                    .fn()
                    .mockImplementation((durationKey: string) => {
                      if (scheduleKey === 'frequency') {
                        return durationKey === 'hours' ? 12 : undefined;
                      }
                      if (scheduleKey === 'timeout') {
                        return durationKey === 'minutes' ? 30 : undefined;
                      }
                      return undefined;
                    }),
                  getOptionalNumber: jest
                    .fn()
                    .mockImplementation((durationKey: string) => {
                      if (scheduleKey === 'frequency') {
                        return durationKey === 'hours' ? 12 : undefined;
                      }
                      if (scheduleKey === 'timeout') {
                        return durationKey === 'minutes' ? 30 : undefined;
                      }
                      return undefined;
                    }),
                  getOptionalString: jest
                    .fn()
                    .mockImplementation((durationKey: string) => {
                      if (scheduleKey === 'frequency') {
                        return durationKey === 'hours' ? '12h' : undefined;
                      }
                      if (scheduleKey === 'timeout') {
                        return durationKey === 'minutes' ? '30m' : undefined;
                      }
                      return undefined;
                    }),
                  has: jest.fn().mockImplementation((durationKey: string) => {
                    if (scheduleKey === 'frequency') {
                      return durationKey === 'hours';
                    }
                    if (scheduleKey === 'timeout') {
                      return durationKey === 'minutes';
                    }
                    return false;
                  }),
                  keys: jest.fn().mockImplementation(() => {
                    if (scheduleKey === 'frequency') {
                      return ['hours'];
                    }
                    if (scheduleKey === 'timeout') {
                      return ['minutes'];
                    }
                    return [];
                  }),
                };
              }
              return {};
            }),
            has: jest.fn().mockImplementation((scheduleKey: string) => {
              return ['frequency', 'timeout'].includes(scheduleKey);
            }),
            keys: jest.fn().mockReturnValue(['frequency', 'timeout']),
          };
          return scheduleConfig;
        }
        if (key === 'development' || key === 'production') {
          return {
            getString: jest.fn().mockImplementation((path: string) => {
              if (path === 'orgs') {
                return 'TestOrg';
              }
              throw new Error(`No value for ${path}`);
            }),
            getStringArray: jest.fn().mockImplementation((path: string) => {
              if (path === 'orgs') {
                return ['TestOrg'];
              }
              throw new Error(`No value for ${path}`);
            }),
            getOptionalBoolean: jest.fn().mockReturnValue(false),
            getOptionalStringArray: jest.fn().mockReturnValue([]),
          };
        }
        return mockAnsibleConfig;
      }),
      has: jest.fn().mockImplementation((key: string) => {
        return [
          'rhaap.baseUrl',
          'rhaap.token',
          'rhaap.checkSSL',
          'analytics.enabled',
          'catalog.providers.rhaap.development.sync.orgsUsersTeams.schedule',
          'catalog.providers.rhaap.development.sync.jobTemplates.schedule',
          'catalog.providers.rhaap.development.orgs',
          'catalog.providers.rhaap.production.orgs',
          'catalog.providers.rhaap.development',
          'catalog.providers.rhaap.production',
        ].includes(key);
      }),
      keys: jest.fn().mockReturnValue([]),
    } as unknown as Config;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as LoggerService;

    mockFetch = fetch as jest.Mock;

    client = new AAPClient({
      rootConfig: mockConfig,
      logger: mockLogger,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('HTTP Methods', () => {
    describe('executePostRequest', () => {
      it('should successfully execute a POST request', async () => {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({ id: 1 }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await client.executePostRequest(
          'test/endpoint',
          'test-token',
          { data: 'test' },
        );

        expect(mockFetch).toHaveBeenCalledWith(
          'https://test.example.com/test/endpoint',
          expect.objectContaining({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-token',
            },
            body: JSON.stringify({ data: 'test' }),
          }),
        );
        expect(result).toBe(mockResponse);
      });

      it('should handle network errors', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));

        await expect(
          client.executePostRequest('test/endpoint', 'test-token', {
            data: 'test',
          }),
        ).rejects.toThrow('Failed to send POST request: Network error');
      });

      it('should handle 403 errors', async () => {
        const mockResponse = {
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          json: jest.fn().mockResolvedValue({
            detail: 'Insufficient privileges',
          }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        await expect(
          client.executePostRequest('test/endpoint', 'test-token', {
            data: 'test',
          }),
        ).rejects.toThrow('Insufficient privileges');
      });

      it('should handle error response with __all__ field', async () => {
        const mockResponse = {
          ok: false,
          status: 400,
          json: jest.fn().mockResolvedValue({
            __all__: ['Error 1', 'Error 2'],
          }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        await expect(
          client.executePostRequest('test/endpoint', 'test-token', {
            data: 'test',
          }),
        ).rejects.toThrow('Error 1 Error 2');
      });
      it('should execute a POST request with auth param and no token', async () => {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({ id: 2 }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const formData = new URLSearchParams();
        formData.append('key', 'value');

        const result = await client.executePostRequest(
          'test/endpoint',
          undefined,
          formData,
          true,
        );

        expect(mockFetch).toHaveBeenCalledWith(
          'https://test.example.com/test/endpoint',
          expect.objectContaining({
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData,
          }),
        );
        expect(result).toBe(mockResponse);
      });
    });

    describe('executeGetRequest', () => {
      it('should successfully execute a GET request', async () => {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({ data: 'test' }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await client.executeGetRequest(
          'test/endpoint',
          'test-token',
        );

        expect(mockFetch).toHaveBeenCalledWith(
          'https://test.example.com/test/endpoint',
          expect.objectContaining({
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-token',
            },
          }),
        );
        expect(result).toBe(mockResponse);
      });

      it('should handle network errors', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));

        await expect(
          client.executeGetRequest('test/endpoint', 'test-token'),
        ).rejects.toThrow('Failed to send fetch data: Network error');
      });
    });

    describe('executeDeleteRequest', () => {
      it('should successfully execute a DELETE request', async () => {
        const mockResponse = {
          ok: true,
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await client.executeDeleteRequest(
          'test/endpoint',
          'test-token',
        );

        expect(mockFetch).toHaveBeenCalledWith(
          'https://test.example.com/test/endpoint',
          expect.objectContaining({
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-token',
            },
          }),
        );
        expect(result).toBe(mockResponse);
      });

      it('should handle network errors', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));

        await expect(
          client.executeDeleteRequest('test/endpoint', 'test-token'),
        ).rejects.toThrow('Failed to send delete: Network error');
      });
    });
  });

  describe('Project Operations', () => {
    describe('getProject', () => {
      it('should fetch project details', async () => {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({ id: 1, name: 'test-project' }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await client.getProject(1, 'test-token');

        expect(result).toEqual({ id: 1, name: 'test-project' });
        expect(mockFetch).toHaveBeenCalledWith(
          'https://test.example.com/api/controller/v2/projects/1/',
          expect.any(Object),
        );
      });
    });

    describe('deleteProject', () => {
      it('should delete a project', async () => {
        const mockResponse = { ok: true };
        mockFetch.mockResolvedValue(mockResponse);

        await client.deleteProject(1, 'test-token');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://test.example.com/api/controller/v2/projects/1/',
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });

    describe('deleteProjectIfExists', () => {
      it('should delete project if it exists', async () => {
        const mockListResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [{ id: 1, name: 'test-project' }],
          }),
        };
        const mockDeleteResponse = { ok: true };
        mockFetch
          .mockResolvedValueOnce(mockListResponse)
          .mockResolvedValueOnce(mockDeleteResponse);

        await client.deleteProjectIfExists(
          'test-project',
          { id: 1, name: 'test-org' },
          'test-token',
        );

        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('should not delete if project does not exist', async () => {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({ results: [] }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        await client.deleteProjectIfExists(
          'test-project',
          { id: 1, name: 'test-org' },
          'test-token',
        );

        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });

    describe('createProject', () => {
      it('should create a project and wait for success', async () => {
        const mockCreateResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            id: 1,
            name: 'test-project',
            status: 'successful',
          }),
        };
        mockFetch.mockResolvedValue(mockCreateResponse);

        const projectPayload = {
          projectName: 'test-project',
          organization: { id: 1, name: 'test-org' },
          scmUrl: 'https://github.com/test/repo',
          scmUpdateOnLaunch: true,
        };

        const result = await client.createProject(
          projectPayload,
          false,
          'test-token',
        );

        expect(result).toEqual({
          id: 1,
          name: 'test-project',
          status: 'successful',
          url: 'https://test.example.com/execution/projects/1/details',
        });
      });

      it('should handle project creation failure', async () => {
        const mockCreateResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            id: 1,
            name: 'test-project',
            status: 'failed',
            related: {
              last_job: 'https://test.example.com/api/controller/v2/jobs/123/',
            },
          }),
        };
        const mockEventsResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [
              {
                event_data: {
                  res: {
                    msg: 'Failed to create project',
                  },
                },
              },
            ],
          }),
        };
        mockFetch
          .mockResolvedValueOnce(mockCreateResponse)
          .mockResolvedValueOnce(mockEventsResponse);

        const projectPayload = {
          projectName: 'test-project',
          organization: { id: 1, name: 'test-org' },
          scmUrl: 'https://github.com/test/repo',
          scmUpdateOnLaunch: true,
        };

        await expect(
          client.createProject(projectPayload, false, 'test-token'),
        ).rejects.toThrow('Failed to create project');
      });
    });
  });

  describe('Job Template Operations', () => {
    describe('deleteJobTemplate', () => {
      it('should delete a job template', async () => {
        const mockResponse = { ok: true };
        mockFetch.mockResolvedValue(mockResponse);

        await client.deleteJobTemplate(1, 'test-token');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://test.example.com/api/controller/v2/job_templates/1/',
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });

    describe('deleteJobTemplateIfExists', () => {
      it('should delete template if it exists', async () => {
        const mockListResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [{ id: 1, name: 'test-template' }],
          }),
        };
        const mockDeleteResponse = { ok: true };
        mockFetch
          .mockResolvedValueOnce(mockListResponse)
          .mockResolvedValueOnce(mockDeleteResponse);

        await client.deleteJobTemplateIfExists(
          'test-template',
          { id: 1, name: 'test-org' },
          'test-token',
        );

        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    describe('createJobTemplate', () => {
      it('should create a job template', async () => {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            id: 1,
            name: 'test-template',
          }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const templatePayload = {
          templateName: 'test-template',
          organization: { id: 1, name: 'test-org' },
          jobInventory: { id: 1, name: 'test-inventory' },
          project: {
            id: 1,
            projectName: 'test-project',
            organization: { id: 1, name: 'test-org' },
            scmUrl: 'https://github.com/test/repo',
            scmUpdateOnLaunch: true,
            status: 'successful',
          },
          playbook: 'test.yml',
          executionEnvironment: {
            id: 1,
            environmentName: 'test-ee',
            organization: { id: 1, name: 'test-org' },
            image: 'test-image',
            pull: 'always',
          },
          extraVariables: { test: 'value' },
        };

        const result = await client.createJobTemplate(
          templatePayload,
          false,
          'test-token',
        );

        expect(result).toEqual({
          id: 1,
          name: 'test-template',
          url: 'https://test.example.com/execution/templates/job-template/1/details',
        });
      });
    });

    describe('launchJobTemplate', () => {
      beforeEach(() => {
        jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
          cb();
          return {} as any;
        });
      });

      it('should launch a job template and handle success', async () => {
        const mockTemplateResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [{ id: 456, name: 'test-template' }],
          }),
        };
        const mockLaunchResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({ job: 123 }),
        };
        const mockStatusResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({ status: 'successful' }),
        };
        const mockEventsResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [{ event_data: { test: 'data' } }],
            next: null,
          }),
        };

        mockFetch
          .mockResolvedValueOnce(mockTemplateResponse)
          .mockResolvedValueOnce(mockLaunchResponse)
          .mockResolvedValueOnce(mockStatusResponse)
          .mockResolvedValueOnce(mockEventsResponse);

        const result = await client.launchJobTemplate(
          {
            template: 'test-template',
            inventory: { id: 1, name: 'test-inventory' },
            credentials: [
              {
                id: 1,
                type: 'scm',
                name: 'Test Credential',
                credential_type: 1,
                summary_fields: {
                  credential_type: { id: 1, name: 'scm' },
                },
              },
            ],
          },
          'test-token',
        );

        expect(result).toEqual({
          id: 123,
          status: 'successful',
          events: [{ event_data: { test: 'data' } }],
          url: 'https://test.example.com/execution/jobs/playbook/123/output',
        });
      });

      it('should handle duplicate credential types', async () => {
        await expect(
          client.launchJobTemplate(
            {
              template: 'test-template',
              credentials: [
                {
                  id: 1,
                  type: 'scm',
                  name: 'Test Credential 1',
                  credential_type: 1,
                  summary_fields: {
                    credential_type: { id: 1, name: 'scm' },
                  },
                },
                {
                  id: 2,
                  type: 'scm',
                  name: 'Test Credential 2',
                  credential_type: 1,
                  summary_fields: {
                    credential_type: { id: 1, name: 'scm' },
                  },
                },
              ],
            },
            'test-token',
          ),
        ).rejects.toThrow(
          'Cannot assign multiple credentials of the same type',
        );
      });

      it('should handle failed job execution with error parsing', async () => {
        const mockTemplateResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [{ id: 456, name: 'test-template' }],
          }),
        };
        const mockLaunchResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({ job: 123 }),
        };
        const mockStatusResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({ status: 'failed' }),
        };
        const mockEventsResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [{ event_data: { test: 'data' } }],
            next: null,
          }),
        };
        const mockStdoutResponse = {
          ok: true,
          text: jest.fn().mockResolvedValue('{"msg": "Task failed"}'),
        };

        mockFetch
          .mockResolvedValueOnce(mockTemplateResponse)
          .mockResolvedValueOnce(mockLaunchResponse)
          .mockResolvedValueOnce(mockStatusResponse)
          .mockResolvedValueOnce(mockEventsResponse)
          .mockResolvedValueOnce(mockStdoutResponse);

        await expect(
          client.launchJobTemplate(
            {
              template: 'test-template',
            },
            'test-token',
          ),
        ).rejects.toThrow('Job execution failed due to Task failed');
      });

      it('should handle failed job execution with stdout error', async () => {
        const mockTemplateResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [{ id: 456, name: 'test-template' }],
          }),
        };
        const mockLaunchResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({ job: 123 }),
        };
        const mockStatusResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({ status: 'failed' }),
        };
        const mockEventsResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [{ event_data: { test: 'data' } }],
            next: null,
          }),
        };

        mockFetch
          .mockResolvedValueOnce(mockTemplateResponse)
          .mockResolvedValueOnce(mockLaunchResponse)
          .mockResolvedValueOnce(mockStatusResponse)
          .mockResolvedValueOnce(mockEventsResponse)
          .mockRejectedValueOnce(new Error('Stdout error'));

        await expect(
          client.launchJobTemplate(
            {
              template: 'test-template',
            },
            'test-token',
          ),
        ).rejects.toThrow('Job execution failed due to Undefined Error');
      });

      it('should handle template not found error', async () => {
        const mockTemplateResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [],
          }),
        };

        mockFetch.mockResolvedValueOnce(mockTemplateResponse);

        await expect(
          client.launchJobTemplate(
            {
              template: 'non existing template',
            },
            'test-token',
          ),
        ).rejects.toThrow(
          'No job template found with name: non existing template',
        );
      });

      it('should launch a job template with timeout parameter', async () => {
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({
              results: [{ id: 1, name: 'Test Template' }],
            }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({ job: 123 }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({ status: 'successful' }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({ results: [] }),
          });

        const result = await client.launchJobTemplate(
          {
            template: 'Test Template',
            timeout: 300,
          },
          'test-token',
        );

        expect(result.status).toBe('successful');
      });

      describe('Parameter Setting Tests', () => {
        let launchSpy: jest.SpyInstance;

        beforeEach(() => {
          // Mock the necessary responses for successful job template launch
          mockFetch
            .mockResolvedValueOnce({
              ok: true,
              json: jest.fn().mockResolvedValue({
                results: [{ id: 1, name: 'Test Template' }],
              }),
            })
            .mockResolvedValueOnce({
              ok: true,
              json: jest.fn().mockResolvedValue({ job: 123 }),
            })
            .mockResolvedValueOnce({
              ok: true,
              json: jest.fn().mockResolvedValue({ status: 'successful' }),
            })
            .mockResolvedValueOnce({
              ok: true,
              json: jest.fn().mockResolvedValue({ results: [] }),
            });

          // Spy on executePostRequest to capture the data being sent
          launchSpy = jest.spyOn(client, 'executePostRequest');
        });

        it('should set jobType when provided', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
              jobType: 'check',
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.objectContaining({
              job_type: 'check',
            }),
          );
        });

        it('should not set jobType when not provided', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.not.objectContaining({
              job_type: expect.anything(),
            }),
          );
        });

        it('should set executionEnvironment when provided with id', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
              executionEnvironment: {
                id: 42,
                environmentName: 'test-ee',
                organization: { id: 1, name: 'test-org' },
                image: 'test-image',
                pull: 'always',
              },
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.objectContaining({
              execution_environment: 42,
            }),
          );
        });

        it('should not set executionEnvironment when id is missing', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
              executionEnvironment: {
                environmentName: 'test-ee',
                organization: { id: 1, name: 'test-org' },
                image: 'test-image',
                pull: 'always',
              },
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.not.objectContaining({
              execution_environment: expect.anything(),
            }),
          );
        });

        it('should set forks when provided as positive number', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
              forks: 5,
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.objectContaining({
              forks: 5,
            }),
          );
        });

        it('should set forks when provided as zero', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
              forks: 0,
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.objectContaining({
              forks: 0,
            }),
          );
        });

        it('should not set forks when not provided', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.not.objectContaining({
              forks: expect.anything(),
            }),
          );
        });

        it('should set limit when provided', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
              limit: 'web',
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.objectContaining({
              limit: 'web',
            }),
          );
        });

        it('should not set limit when not provided', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.not.objectContaining({
              limit: expect.anything(),
            }),
          );
        });

        it('should set verbosity when provided with id', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
              verbosity: { id: 3, name: 'verbose' },
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.objectContaining({
              verbosity: 3,
            }),
          );
        });

        it('should set verbosity when provided with id as zero', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
              verbosity: { id: 0, name: 'verbose' },
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.objectContaining({
              verbosity: 0,
            }),
          );
        });

        it('should not set verbosity when not provided', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.not.objectContaining({
              verbosity: expect.anything(),
            }),
          );
        });

        it('should set jobSliceCount when provided as positive number', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
              jobSliceCount: 4,
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.objectContaining({
              job_slice_count: 4,
            }),
          );
        });

        it('should set jobSliceCount when provided as zero', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
              jobSliceCount: 0,
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.objectContaining({
              job_slice_count: 0,
            }),
          );
        });

        it('should not set jobSliceCount when not provided', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.not.objectContaining({
              job_slice_count: expect.anything(),
            }),
          );
        });

        it('should set timeout when provided', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
              timeout: 300,
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.objectContaining({
              timeout: 300,
            }),
          );
        });

        it('should set timeout when provided as zero', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
              timeout: 0,
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.objectContaining({
              timeout: 0,
            }),
          );
        });

        it('should not set timeout when not provided', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.not.objectContaining({
              timeout: expect.anything(),
            }),
          );
        });

        it('should set diffMode when provided as true', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
              diffMode: true,
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.objectContaining({
              diff_mode: true,
            }),
          );
        });

        it('should set diffMode when provided as false', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
              diffMode: false,
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.objectContaining({
              diff_mode: false,
            }),
          );
        });

        it('should not set diffMode when not provided', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.not.objectContaining({
              diff_mode: expect.anything(),
            }),
          );
        });

        it('should set jobTags when provided', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
              jobTags: 'tag1,tag2',
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.objectContaining({
              job_tags: 'tag1,tag2',
            }),
          );
        });

        it('should not set jobTags when not provided', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.not.objectContaining({
              job_tags: expect.anything(),
            }),
          );
        });

        it('should set skipTags when provided', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
              skipTags: 'skip1,skip2',
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.objectContaining({
              skip_tags: 'skip1,skip2',
            }),
          );
        });

        it('should not set skipTags when not provided', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.not.objectContaining({
              skip_tags: expect.anything(),
            }),
          );
        });

        it('should set multiple parameters when all are provided', async () => {
          await client.launchJobTemplate(
            {
              template: 'Test Template',
              jobType: 'run',
              executionEnvironment: {
                id: 1,
                environmentName: 'test-ee',
                organization: { id: 1, name: 'test-org' },
                image: 'test-image',
                pull: 'always',
              },
              forks: 5,
              limit: 'web',
              verbosity: { id: 2, name: 'verbose' },
              jobSliceCount: 3,
              timeout: 600,
              diffMode: true,
              jobTags: 'deploy',
              skipTags: 'skip-backup',
            },
            'test-token',
          );

          expect(launchSpy).toHaveBeenCalledWith(
            expect.stringContaining('launch'),
            'test-token',
            expect.objectContaining({
              job_type: 'run',
              execution_environment: 1,
              forks: 5,
              limit: 'web',
              verbosity: 2,
              job_slice_count: 3,
              timeout: 600,
              diff_mode: true,
              job_tags: 'deploy',
              skip_tags: 'skip-backup',
            }),
          );
        });
      });
    });

    describe('fetchEvents', () => {
      it('should fetch all events with pagination', async () => {
        const mockFirstResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [{ id: 1, event: 'first' }],
            next: '/next-page',
          }),
        };
        const mockSecondResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [{ id: 2, event: 'second' }],
            next: null,
          }),
        };

        mockFetch
          .mockResolvedValueOnce(mockFirstResponse)
          .mockResolvedValueOnce(mockSecondResponse);

        const result = await client.fetchEvents(123, 'test-token');

        expect(result).toEqual([
          { id: 1, event: 'first' },
          { id: 2, event: 'second' },
        ]);
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('should handle single page of events', async () => {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [{ id: 1, event: 'single' }],
            next: null,
          }),
        };

        mockFetch.mockResolvedValue(mockResponse);

        const result = await client.fetchEvents(123, 'test-token');

        expect(result).toEqual([{ id: 1, event: 'single' }]);
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });

    describe('fetchResult', () => {
      beforeEach(() => {
        jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
          cb();
          return {} as any;
        });
      });

      it('should fetch job result and events', async () => {
        const mockJobResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            status: 'successful',
            other_data: 'test',
          }),
        };
        const mockEventsResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [{ event_data: 'test event' }],
            next: null,
          }),
        };

        mockFetch
          .mockResolvedValueOnce(mockJobResponse)
          .mockResolvedValueOnce(mockEventsResponse);

        const result = await client.fetchResult(123, 'test-token');

        expect(result).toEqual({
          jobEvents: [{ event_data: 'test event' }],
          jobData: {
            status: 'successful',
            other_data: 'test',
          },
        });
      });

      it('should wait for job completion', async () => {
        const mockRunningResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            status: 'running',
          }),
        };
        const mockCompletedResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            status: 'successful',
          }),
        };
        const mockEventsResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [{ event_data: 'test event' }],
            next: null,
          }),
        };

        mockFetch
          .mockResolvedValueOnce(mockRunningResponse)
          .mockResolvedValueOnce(mockCompletedResponse)
          .mockResolvedValueOnce(mockEventsResponse);

        const result = await client.fetchResult(123, 'test-token');

        expect(result.jobData.status).toBe('successful');
        expect(mockFetch).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('Execution Environment Operations', () => {
    describe('createExecutionEnvironment', () => {
      it('should create an execution environment', async () => {
        const mockCreateResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            id: 1,
            name: 'test-ee',
            status: 'successful',
          }),
        };
        mockFetch.mockResolvedValue(mockCreateResponse);

        const eePayload = {
          environmentName: 'test-ee',
          organization: { id: 1, name: 'test-org' },
          image: 'test-image',
          pull: 'always',
        };

        const result = await client.createExecutionEnvironment(
          eePayload,
          'test-token',
        );

        expect(result).toEqual(
          expect.objectContaining({
            status: 'successful',
            url: expect.stringContaining(
              '/execution/infrastructure/execution-environments/',
            ),
          }),
        );
      });
    });

    describe('deleteExecutionEnvironment', () => {
      it('should delete an execution environment', async () => {
        const mockResponse = { ok: true };
        mockFetch.mockResolvedValue(mockResponse);

        await client.deleteExecutionEnvironment(1, 'test-token');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://test.example.com/api/controller/v2/execution_environments/1/',
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });

    describe('deleteExecutionEnvironmentExists', () => {
      beforeEach(() => {
        jest.clearAllMocks();
      });

      it('should delete execution environment when it exists', async () => {
        const mockGetResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [
              {
                id: 123,
                name: 'test-env',
              },
            ],
          }),
        };
        const mockDeleteResponse = {
          ok: true,
        };

        mockFetch
          .mockResolvedValueOnce(mockGetResponse)
          .mockResolvedValueOnce(mockDeleteResponse);

        const deletePromise = client.deleteExecutionEnvironmentExists(
          'test-env',
          'test-token',
        );

        await deletePromise;

        expect(mockFetch).toHaveBeenNthCalledWith(
          1,
          'https://test.example.com/api/controller/v2/execution_environments/?name=test-env',
          expect.objectContaining({
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-token',
            },
          }),
        );

        expect(mockFetch).toHaveBeenNthCalledWith(
          2,
          'https://test.example.com/api/controller/v2/execution_environments/123/',
          expect.objectContaining({
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-token',
            },
          }),
        );
      });

      it('should not delete execution environment when it does not exist', async () => {
        const mockGetResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [],
          }),
        };
        mockFetch.mockResolvedValueOnce(mockGetResponse);

        const deletePromise = client.deleteExecutionEnvironmentExists(
          'test-env',
          'test-token',
        );

        await deletePromise;

        expect(mockFetch).toHaveBeenCalledWith(
          'https://test.example.com/api/controller/v2/execution_environments/?name=test-env',
          expect.objectContaining({
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-token',
            },
          }),
        );

        expect(mockFetch).not.toHaveBeenCalledWith(
          expect.stringContaining('/api/controller/v2/execution_environments/'),
          expect.objectContaining({ method: 'DELETE' }),
        );
      });

      it('should handle errors when deleting environment', async () => {
        const mockGetResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [
              {
                id: 123,
                name: 'test-env',
              },
            ],
          }),
        };
        mockFetch.mockResolvedValueOnce(mockGetResponse);

        mockFetch.mockRejectedValueOnce(new Error('Delete failed'));

        await expect(
          client.deleteExecutionEnvironmentExists('test-env', 'test-token'),
        ).rejects.toThrow('Failed to send delete: Delete failed');

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch).toHaveBeenNthCalledWith(
          1,
          'https://test.example.com/api/controller/v2/execution_environments/?name=test-env',
          expect.objectContaining({ method: 'GET' }),
        );
        expect(mockFetch).toHaveBeenNthCalledWith(
          2,
          'https://test.example.com/api/controller/v2/execution_environments/123/',
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });
  });

  describe('Utility Methods', () => {
    describe('cleanUp', () => {
      it('should clean up all resources', async () => {
        const mockResponse = { ok: true };
        mockFetch.mockResolvedValue(mockResponse);

        const payload = {
          project: {
            id: 1,
            projectName: 'test-project',
            organization: { id: 1, name: 'test-org' },
            scmUrl: 'https://github.com/test/repo',
            scmUpdateOnLaunch: true,
          },
          template: {
            id: 1,
            templateName: 'test-template',
            organization: { id: 1, name: 'test-org' },
            project: {
              id: 1,
              projectName: 'test-project',
              organization: { id: 1, name: 'test-org' },
              scmUrl: 'https://github.com/test/repo',
              scmUpdateOnLaunch: true,
            },
            jobInventory: { id: 1, name: 'test-inventory' },
            playbook: 'test.yml',
          },
          executionEnvironment: {
            id: 1,
            environmentName: 'test-ee',
            organization: { id: 1, name: 'test-org' },
            image: 'test-image',
            pull: 'always',
          },
        };

        await client.cleanUp(payload, 'test-token');

        expect(mockFetch).toHaveBeenCalledTimes(3);
      });
    });

    describe('getResourceData', () => {
      it('should fetch resource data', async () => {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({ results: [{ id: 1 }] }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await client.getResourceData(
          'test-resource',
          'test-token',
        );

        expect(result).toEqual({ results: [{ id: 1 }] });
      });

      it('should handle execution_environments resource with orgId', async () => {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({ results: [{ id: 1 }] }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await client.getResourceData(
          'execution_environments:123',
          'test-token',
        );

        expect(result).toEqual({ results: [{ id: 1 }] });
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('or__organization__id=123'),
          expect.any(Object),
        );
      });

      it('should handle job_templates resource with survey and labels', async () => {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({ results: [{ id: 1 }] }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await client.getResourceData(
          'job_templates',
          'test-token',
        );

        expect(result).toEqual({ results: [{ id: 1 }] });
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('organization__name__iexact=testorg'),
          expect.any(Object),
        );
      });

      it('should handle job_templates resource with multiple organizations', async () => {
        // Create a new client with multiple organizations
        const mockMultiOrgCatalogRhaapConfig = {
          keys: jest.fn().mockReturnValue(['development']),
          getConfig: jest.fn().mockImplementation((key: string) => {
            if (key === 'development') {
              return {
                getString: jest.fn().mockImplementation((path: string) => {
                  if (path === 'orgs') {
                    return 'TestOrg1,TestOrg2';
                  }
                  throw new Error(`No value for ${path}`);
                }),
                getStringArray: jest.fn().mockImplementation((path: string) => {
                  if (path === 'orgs') {
                    return ['TestOrg1', 'TestOrg2'];
                  }
                  throw new Error(`No value for ${path}`);
                }),
                getOptionalBoolean: jest.fn().mockReturnValue(false),
                getOptionalStringArray: jest.fn().mockReturnValue([]),
              };
            }
            throw new Error(`No config for key ${key}`);
          }),
        };

        const mockMultiOrgConfig = {
          ...mockConfig,
          getOptionalConfig: jest.fn().mockImplementation((path: string) => {
            if (path === 'catalog.providers.rhaap') {
              return mockMultiOrgCatalogRhaapConfig;
            }
            return mockConfig.getOptionalConfig(path);
          }),
        };

        const multiOrgClient = new AAPClient({
          rootConfig: mockMultiOrgConfig,
          logger: mockLogger,
        });

        const mockResponse = {
          ok: true,
          json: jest
            .fn()
            .mockResolvedValue({ results: [{ id: 1 }, { id: 2 }] }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await multiOrgClient.getResourceData(
          'job_templates',
          'test-token',
        );

        expect(result).toEqual({ results: [{ id: 1 }, { id: 2 }] });
        // Due to urlSearchParams.set() overwriting values, only the last organization will be in the URL
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('or__organization__name__iexact=testorg2'),
          expect.any(Object),
        );
      });

      it('should handle job_templates resource with no organizations', async () => {
        // Create a new client with no organizations
        const mockNoOrgCatalogRhaapConfig = {
          keys: jest.fn().mockReturnValue([]), // No keys means no organizations configured
        };

        const mockNoOrgConfig = {
          ...mockConfig,
          getOptionalConfig: jest.fn().mockImplementation((path: string) => {
            if (path === 'catalog.providers.rhaap') {
              return mockNoOrgCatalogRhaapConfig;
            }
            return mockConfig.getOptionalConfig(path);
          }),
        };

        const noOrgClient = new AAPClient({
          rootConfig: mockNoOrgConfig,
          logger: mockLogger,
        });

        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({ results: [{ id: 1 }] }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await noOrgClient.getResourceData(
          'job_templates',
          'test-token',
        );

        expect(result).toEqual({ results: [{ id: 1 }] });
        // When no organizations are configured, no organization filter should be applied
        expect(mockFetch).toHaveBeenCalledWith(
          expect.not.stringContaining('organization__name__iexact'),
          expect.any(Object),
        );
        expect(mockFetch).toHaveBeenCalledWith(
          expect.not.stringContaining('or__organization__name__iexact'),
          expect.any(Object),
        );
      });

      it('should handle job_templates resource with labels', async () => {
        // Create a client with job template labels configured
        const mockLabelCatalogConfig = {
          keys: jest.fn().mockReturnValue(['development']),
          getConfig: jest.fn().mockImplementation((key: string) => {
            if (key === 'development') {
              return {
                getString: jest.fn().mockImplementation((path: string) => {
                  if (path === 'orgs') {
                    return 'TestOrg';
                  }
                  throw new Error(`No value for ${path}`);
                }),
                getStringArray: jest.fn().mockImplementation((path: string) => {
                  if (path === 'orgs') {
                    return ['TestOrg'];
                  }
                  throw new Error(`No value for ${path}`);
                }),
                getOptionalBoolean: jest.fn().mockReturnValue(false),
                getOptionalStringArray: jest
                  .fn()
                  .mockImplementation((labelKey: string) => {
                    if (labelKey === 'sync.jobTemplates.labels') {
                      return ['label1', 'label2'];
                    }
                    return [];
                  }),
              };
            }
            throw new Error(`No config for key ${key}`);
          }),
        };

        const mockLabelConfig = {
          ...mockConfig,
          getOptionalConfig: jest.fn().mockImplementation((path: string) => {
            if (path === 'catalog.providers.rhaap') {
              return mockLabelCatalogConfig;
            }
            return mockConfig.getOptionalConfig(path);
          }),
        };

        const labelClient = new AAPClient({
          rootConfig: mockLabelConfig,
          logger: mockLogger,
        });

        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({ results: [{ id: 1 }] }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        await labelClient.getResourceData('job_templates', 'test-token');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('or__labels__name__iexact=label2'),
          expect.any(Object),
        );
      });
    });

    describe('getJobTemplatesByName', () => {
      it('should fetch job templates by name', async () => {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [
              { id: 1, name: 'template1' },
              { id: 2, name: 'template2' },
            ],
          }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await client.getJobTemplatesByName(
          ['template1', 'template2'],
          { id: 1, name: 'test-org' },
          'test-token',
        );

        expect(result).toEqual([
          { id: 1, name: 'template1' },
          { id: 2, name: 'template2' },
        ]);
      });

      it('should handle no templates found', async () => {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({ results: [] }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        await expect(
          client.getJobTemplatesByName(
            ['template1'],
            { id: 1, name: 'test-org' },
            'test-token',
          ),
        ).rejects.toThrow('No job templates found');
      });
    });

    describe('setLogger', () => {
      it('should set a new logger', () => {
        const newLogger = {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn(),
        } as unknown as LoggerService;

        client.setLogger(newLogger);

        client.executeGetRequest('test', 'token');
        expect(newLogger.info).toHaveBeenCalled();
      });
    });
  });

  describe('Catalog Functions', () => {
    describe('getOrganizations', () => {
      it('should fetch organizations with teams and users details', async () => {
        const mockOrgsData = [
          {
            id: 1,
            name: 'TestOrg',
            namespace: 'testorg',
            related: {
              users:
                'https://test.example.com/api/gateway/v1/organizations/1/users/',
              teams:
                'https://test.example.com/api/gateway/v1/organizations/1/teams/',
            },
          },
        ];

        const mockTeamsData = [
          {
            id: 1,
            organization: 1,
            name: 'Test Team',
            description: 'A test team',
            related: {
              users: 'https://test.example.com/api/gateway/v1/teams/1/users/',
            },
          },
        ];

        const mockOrgUsersData = [
          {
            id: 1,
            username: 'user1',
            email: 'user1@example.com',
            first_name: 'User',
            last_name: 'One',
          },
        ];

        const mockTeamUsersData = [
          {
            id: 2,
            username: 'user2',
            email: 'user2@example.com',
            first_name: 'User',
            last_name: 'Two',
          },
        ];

        jest
          .spyOn(client as any, 'executeCatalogRequest')
          .mockResolvedValueOnce(mockOrgsData)
          .mockResolvedValueOnce(mockTeamsData)
          .mockResolvedValueOnce(mockOrgUsersData)
          .mockResolvedValueOnce(mockTeamUsersData);

        const result = await client.getOrganizations(true);
        expect((client as any).executeCatalogRequest).toHaveBeenCalledTimes(4);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          organization: {
            id: 1,
            name: 'TestOrg',
            namespace: 'testorg',
          },
          teams: [
            {
              id: 1,
              organization: 1,
              name: 'Test Team',
              groupName: 'test-team',
              description: 'A test team',
            },
          ],
          users: [
            {
              id: 1,
              username: 'user1',
              email: 'user1@example.com',
              first_name: 'User',
              last_name: 'One',
            },
            {
              id: 2,
              username: 'user2',
              email: 'user2@example.com',
              is_orguser: false,
              first_name: 'User',
              last_name: 'Two',
            },
          ],
        });
      });

      it('should fetch organizations with multiple orgs configured', async () => {
        const mockMultiOrgConfig = {
          keys: jest.fn().mockReturnValue(['development']),
          getConfig: jest.fn().mockImplementation((key: string) => {
            if (key === 'development') {
              return {
                getString: jest.fn().mockImplementation((path: string) => {
                  if (path === 'orgs') {
                    return 'TestOrg1,TestOrg2';
                  }
                  throw new Error(`No value for ${path}`);
                }),
                getStringArray: jest.fn().mockImplementation((path: string) => {
                  if (path === 'orgs') {
                    return ['TestOrg1', 'TestOrg2'];
                  }
                  throw new Error(`No value for ${path}`);
                }),
                getOptionalBoolean: jest.fn().mockReturnValue(false),
                getOptionalStringArray: jest.fn().mockReturnValue([]),
              };
            }
            throw new Error(`No config for key ${key}`);
          }),
        };

        const multiOrgClient = new AAPClient({
          rootConfig: {
            ...mockConfig,
            getOptionalConfig: jest.fn().mockImplementation((path: string) => {
              if (path === 'catalog.providers.rhaap') {
                return mockMultiOrgConfig;
              }
              return mockConfig.getOptionalConfig(path);
            }),
          },
          logger: mockLogger,
        });

        jest
          .spyOn(multiOrgClient as any, 'executeCatalogRequest')
          .mockResolvedValueOnce([
            {
              id: 1,
              name: 'TestOrg1',
              namespace: 'testorg1',
            },
          ]);

        const result = await multiOrgClient.getOrganizations(false);
        expect(result).toHaveLength(1);
      });

      it('should handle errors when fetching organization details', async () => {
        jest
          .spyOn(client as any, 'executeCatalogRequest')
          .mockRejectedValueOnce(new Error('API Error'));

        await expect(client.getOrganizations(true)).rejects.toThrow(
          'Error retrieving organization details from api/gateway/v1/organizations/ : Error: API Error.',
        );
      });

      it('should fetch organizations based on config orgs setting', async () => {
        const mockOrgsData = [
          {
            id: 1,
            name: 'TestOrg',
            namespace: 'testorg',
            related: {
              users:
                'https://test.example.com/api/gateway/v1/organizations/1/users/',
              teams:
                'https://test.example.com/api/gateway/v1/organizations/1/teams/',
            },
          },
        ];

        jest
          .spyOn(client as any, 'executeCatalogRequest')
          .mockResolvedValueOnce(mockOrgsData)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        const result = await client.getOrganizations(true);

        expect(result).toHaveLength(1);
        expect(result[0].organization.name).toBe('TestOrg');
      });
    });

    describe('listSystemUsers', () => {
      it('should fetch only superuser users', async () => {
        const mockUsersData = [
          {
            id: 2,
            username: 'user2',
            email: 'user2@example.com',
            first_name: 'User',
            last_name: 'Two',
            is_superuser: true,
          },
          {
            id: 3,
            username: 'admin',
            email: 'admin@example.com',
            first_name: 'Admin',
            last_name: 'User',
            is_superuser: true,
          },
        ];

        jest.spyOn(client as any, 'executeGetRequest').mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: mockUsersData,
          }),
        });

        const result = await client.listSystemUsers();

        expect(result).toHaveLength(2);
        expect(result[0].username).toBe('user2');
        expect(result[1].username).toBe('admin');
        expect(result.every(user => user.is_superuser)).toBe(true);
      });
    });

    describe('getTeamsByUserId', () => {
      it('should fetch teams for a specific user', async () => {
        const mockUserTeamsData = [
          {
            id: 1,
            name: 'Development Team',
            organization: 1,
            summary_fields: {
              organization: {
                name: 'Test Org',
              },
            },
          },
          {
            id: 2,
            name: 'QA Team',
            organization: 1,
            summary_fields: {
              organization: {
                name: 'Test Org',
              },
            },
          },
          {
            id: 3,
            name: null,
            organization: 1,
            summary_fields: {
              organization: {
                name: 'Test Org',
              },
            },
          },
        ];

        jest
          .spyOn(client as any, 'executeCatalogRequest')
          .mockResolvedValueOnce(mockUserTeamsData);

        const result = await client.getTeamsByUserId(1);

        expect(result).toHaveLength(2);
        expect(result).toEqual([
          {
            name: 'Development Team',
            groupName: 'development-team',
            id: 1,
            orgId: 1,
            orgName: 'Test Org',
          },
          {
            name: 'QA Team',
            groupName: 'qa-team',
            id: 2,
            orgId: 1,
            orgName: 'Test Org',
          },
        ]);
      });

      it('should format team names correctly', async () => {
        const mockUserTeamsData = [
          {
            id: 1,
            name: 'Special Team!',
            organization: 1,
            summary_fields: {
              organization: {
                name: 'Test Org',
              },
            },
          },
        ];

        jest
          .spyOn(client as any, 'executeCatalogRequest')
          .mockResolvedValueOnce(mockUserTeamsData);

        const result = await client.getTeamsByUserId(1);

        expect(result[0].groupName).toBe('special-team');
        expect(result[0].orgName).toBe('Test Org');
      });
    });

    describe('getOrgsByUserId', () => {
      it('should fetch organizations for a specific user', async () => {
        const mockUserOrgsData = [
          {
            id: 1,
            name: 'Development Org',
          },
          {
            id: 2,
            name: 'QA Organization',
          },
          {
            id: 3,
            name: null,
          },
          {
            id: 4,
            name: '',
          },
        ];

        jest
          .spyOn(client as any, 'executeCatalogRequest')
          .mockResolvedValueOnce(mockUserOrgsData);

        const result = await client.getOrgsByUserId(1);

        expect(result).toHaveLength(2);
        expect(result).toEqual([
          {
            name: 'Development Org',
            groupName: 'development-org',
          },
          {
            name: 'QA Organization',
            groupName: 'qa-organization',
          },
        ]);
      });

      it('should handle empty organizations list', async () => {
        jest
          .spyOn(client as any, 'executeCatalogRequest')
          .mockResolvedValueOnce([]);

        const result = await client.getOrgsByUserId(1);

        expect(result).toEqual([]);
      });

      it('should format organization names correctly', async () => {
        const mockUserOrgsData = [
          {
            id: 1,
            name: 'Example Org Name!',
          },
        ];

        jest
          .spyOn(client as any, 'executeCatalogRequest')
          .mockResolvedValueOnce(mockUserOrgsData);

        const result = await client.getOrgsByUserId(1);

        expect(result[0].groupName).toBe('example-org-name');
      });
    });

    describe('getUserInfoById', () => {
      it('should fetch user details by ID', async () => {
        const mockUserData = {
          id: 123,
          url: 'https://test.example.com/api/v2/users/123/',
          username: 'testuser',
          email: 'testuser@example.com',
          first_name: 'Test',
          last_name: 'User',
          is_superuser: false,
        };

        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue(mockUserData),
        };

        jest
          .spyOn(client as any, 'executeGetRequest')
          .mockResolvedValueOnce(mockResponse);

        const result = await client.getUserInfoById(123);

        expect(result).toEqual({
          id: 123,
          url: 'https://test.example.com/api/v2/users/123/',
          username: 'testuser',
          email: 'testuser@example.com',
          first_name: 'Test',
          last_name: 'User',
          is_superuser: false,
          is_orguser: true,
        });
      });

      it('should handle user with missing email and names', async () => {
        const mockUserData = {
          id: 456,
          url: 'https://test.example.com/api/v2/users/456/',
          username: 'usernodata',
          is_superuser: true,
        };

        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue(mockUserData),
        };

        jest
          .spyOn(client as any, 'executeGetRequest')
          .mockResolvedValueOnce(mockResponse);

        const result = await client.getUserInfoById(456);

        expect(result).toEqual({
          id: 456,
          url: 'https://test.example.com/api/v2/users/456/',
          username: 'usernodata',
          email: '',
          first_name: '',
          last_name: '',
          is_superuser: true,
          is_orguser: true,
        });
      });

      it('should handle superuser correctly', async () => {
        const mockUserData = {
          id: 789,
          url: 'https://test.example.com/api/v2/users/789/',
          username: 'admin',
          email: 'admin@example.com',
          first_name: 'Admin',
          last_name: 'User',
          is_superuser: true,
        };

        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue(mockUserData),
        };

        jest
          .spyOn(client as any, 'executeGetRequest')
          .mockResolvedValueOnce(mockResponse);

        const result = await client.getUserInfoById(789);

        expect(result.is_superuser).toBe(true);
        expect(result.is_orguser).toBe(true);
      });
    });

    describe('getUserRoleAssignments', () => {
      it('should fetch and format user role assignments', async () => {
        const mockRoleAssignmentsData = [
          {
            user: 1,
            object_id: 10,
            summary_fields: {
              role_definition: {
                name: 'Admin',
              },
            },
          },
          {
            user: 1,
            object_id: 20,
            summary_fields: {
              role_definition: {
                name: 'Admin',
              },
            },
          },
          {
            user: 1,
            object_id: 30,
            summary_fields: {
              role_definition: {
                name: 'User',
              },
            },
          },
          {
            user: 2,
            object_id: 40,
            summary_fields: {
              role_definition: {
                name: 'Viewer',
              },
            },
          },
          {
            user: 3,
            object_id: 50,
            summary_fields: {
              role_definition: {
                name: null,
              },
            },
          },
        ];

        jest
          .spyOn(client as any, 'executeCatalogRequest')
          .mockResolvedValueOnce(mockRoleAssignmentsData);

        const result = await client.getUserRoleAssignments();

        expect(result).toEqual({
          1: {
            Admin: [10, 20],
            User: [30],
          },
          2: {
            Viewer: [40],
          },
          3: {},
        });
      });

      it('should handle role assignments without object_id', async () => {
        const mockRoleAssignmentsData = [
          {
            user: 1,
            object_id: null,
            summary_fields: {
              role_definition: {
                name: 'Admin',
              },
            },
          },
        ];

        jest
          .spyOn(client as any, 'executeCatalogRequest')
          .mockResolvedValueOnce(mockRoleAssignmentsData);

        const result = await client.getUserRoleAssignments();

        expect(result).toEqual({
          1: {
            Admin: [],
          },
        });
      });

      it('should handle empty role assignments', async () => {
        const mockRoleAssignmentsData: any[] = [];

        jest
          .spyOn(client as any, 'executeCatalogRequest')
          .mockResolvedValueOnce(mockRoleAssignmentsData);

        const result = await client.getUserRoleAssignments();

        expect(result).toEqual({});
      });
    });

    describe('syncJobTemplates', () => {
      it('should fetch job templates with a disabled survey from AAP', async () => {
        const mockSurveyDisabledJobTemplateResponse = [
          {
            ...mockJobTemplateResponse[0],
            survey_enabled: false,
          },
        ];

        jest
          .spyOn(client as any, 'executeCatalogRequest')
          .mockResolvedValueOnce(mockSurveyDisabledJobTemplateResponse);

        const result = await client.syncJobTemplates(false, []);
        expect(result).toEqual([
          {
            job: mockSurveyDisabledJobTemplateResponse[0],
            survey: null,
            instanceGroup: [],
          },
        ]);
        expect(result[0].job.survey_enabled).toEqual(false);
      });

      it('should fetch survey enabled job templates from AAP', async () => {
        jest
          .spyOn(client as any, 'executeCatalogRequest')
          .mockResolvedValueOnce(mockJobTemplateResponse);

        jest.spyOn(client as any, 'executeGetRequest').mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockSurveyResponse),
        });

        const result = await client.syncJobTemplates(true, []);
        expect(client.executeGetRequest).toHaveBeenCalled();
        expect(result).toEqual([
          {
            job: mockJobTemplateResponse[0],
            survey: mockSurveyResponse,
            instanceGroup: [],
          },
        ]);
      });

      it('should fetch job templates with labels from AAP', async () => {
        jest
          .spyOn(client as any, 'executeCatalogRequest')
          .mockResolvedValueOnce(mockJobTemplateResponse);
        jest.spyOn(client as any, 'executeGetRequest').mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ results: [] }),
        });

        const result = await client.syncJobTemplates(false, [
          'label1',
          'label2',
        ]);
        expect(result).toEqual([
          {
            job: mockJobTemplateResponse[0],
            survey: { results: [] },
            instanceGroup: [],
          },
        ]);
      });

      it('should fetch job templates with multiple organizations from AAP', async () => {
        const mockMultiOrgConfig = {
          keys: jest.fn().mockReturnValue(['development']),
          getConfig: jest.fn().mockImplementation((key: string) => {
            if (key === 'development') {
              return {
                getString: jest.fn().mockImplementation((path: string) => {
                  if (path === 'orgs') {
                    return 'TestOrg1,TestOrg2';
                  }
                  throw new Error(`No value for ${path}`);
                }),
                getStringArray: jest.fn().mockImplementation((path: string) => {
                  if (path === 'orgs') {
                    return ['TestOrg1', 'TestOrg2'];
                  }
                  throw new Error(`No value for ${path}`);
                }),
                getOptionalBoolean: jest.fn().mockReturnValue(false),
                getOptionalStringArray: jest.fn().mockReturnValue([]),
              };
            }
            throw new Error(`No config for key ${key}`);
          }),
        };

        const multiOrgClient = new AAPClient({
          rootConfig: {
            ...mockConfig,
            getOptionalConfig: jest.fn().mockImplementation((path: string) => {
              if (path === 'catalog.providers.rhaap') {
                return mockMultiOrgConfig;
              }
              return mockConfig.getOptionalConfig(path);
            }),
          },
          logger: mockLogger,
        });

        jest
          .spyOn(multiOrgClient as any, 'executeCatalogRequest')
          .mockResolvedValueOnce(mockJobTemplateResponse);

        await multiOrgClient.syncJobTemplates(false, []);
        expect(
          (multiOrgClient as any).executeCatalogRequest,
        ).toHaveBeenCalled();
      });

      it('should throw an error while fetching job templates from AAP', async () => {
        // Clear any previous mocks
        jest.clearAllMocks();

        jest
          .spyOn(client as any, 'executeCatalogRequest')
          .mockRejectedValueOnce(new Error('API Error'));

        await expect(client.syncJobTemplates(false, [])).rejects.toThrow(
          'Error retrieving job templates from /api/controller/v2/job_templates.',
        );
      });

      it('should fetch job templates with instance groups from AAP', async () => {
        const mockJobTemplateWithInstanceGroups = [
          {
            ...mockJobTemplateResponse[0],
            survey_enabled: false,
            related: {
              ...mockJobTemplateResponse[0].related,
              instance_groups:
                '/api/controller/v2/job_templates/1/instance_groups/',
            },
          },
        ];

        const mockInstanceGroupsResponse = {
          results: [
            { id: 1, name: 'default', capacity: 100 },
            { id: 2, name: 'production', capacity: 200 },
          ],
        };

        // Clear any previous mocks
        jest.clearAllMocks();

        jest
          .spyOn(client as any, 'executeCatalogRequest')
          .mockResolvedValueOnce(mockJobTemplateWithInstanceGroups);

        jest.spyOn(client as any, 'executeGetRequest').mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockInstanceGroupsResponse),
        });

        const result = await client.syncJobTemplates(false, []);

        expect(result).toEqual([
          {
            job: mockJobTemplateWithInstanceGroups[0],
            survey: null,
            instanceGroup: [
              { id: 1, name: 'default', capacity: 100 },
              { id: 2, name: 'production', capacity: 200 },
            ],
          },
        ]);

        expect(client.executeGetRequest).toHaveBeenCalledWith(
          '/api/controller/v2/job_templates/1/instance_groups/',
          'test-token',
        );
      });

      it('should handle job templates without instance groups', async () => {
        const mockJobTemplateWithoutInstanceGroups = [
          {
            ...mockJobTemplateResponse[0],
            survey_enabled: false,
            related: {
              ...mockJobTemplateResponse[0].related,
              instance_groups: undefined,
            },
          },
        ];

        // Clear any previous mocks
        jest.clearAllMocks();

        jest
          .spyOn(client as any, 'executeCatalogRequest')
          .mockResolvedValueOnce(mockJobTemplateWithoutInstanceGroups);

        const executeGetRequestSpy = jest.spyOn(
          client as any,
          'executeGetRequest',
        );

        const result = await client.syncJobTemplates(false, []);

        expect(result).toEqual([
          {
            job: mockJobTemplateWithoutInstanceGroups[0],
            survey: null,
            instanceGroup: [],
          },
        ]);

        // Should not call executeGetRequest for instance groups
        expect(executeGetRequestSpy).not.toHaveBeenCalled();
      });

      it('should fetch job templates with both survey and instance groups', async () => {
        const mockJobTemplateWithBoth = [
          {
            ...mockJobTemplateResponse[0],
            survey_enabled: true,
            related: {
              ...mockJobTemplateResponse[0].related,
              instance_groups:
                '/api/controller/v2/job_templates/1/instance_groups/',
            },
          },
        ];

        const mockInstanceGroupsResponse = {
          results: [{ id: 1, name: 'default', capacity: 100 }],
        };

        // Clear any previous mocks
        jest.clearAllMocks();

        jest
          .spyOn(client as any, 'executeCatalogRequest')
          .mockResolvedValueOnce(mockJobTemplateWithBoth);

        jest
          .spyOn(client as any, 'executeGetRequest')
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(mockSurveyResponse),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(mockInstanceGroupsResponse),
          });

        const result = await client.syncJobTemplates(true, []);

        expect(result).toEqual([
          {
            job: mockJobTemplateWithBoth[0],
            survey: mockSurveyResponse,
            instanceGroup: [{ id: 1, name: 'default', capacity: 100 }],
          },
        ]);

        // Should call executeGetRequest for both survey and instance groups
        expect(client.executeGetRequest).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Authentication Methods', () => {
    describe('rhAAPAuthenticate', () => {
      it('should authenticate with authorization code', async () => {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            access_token: 'test-access-token',
            token_type: 'Bearer',
            scope: 'read write',
            expires_in: 3600,
            refresh_token: 'test-refresh-token',
          }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await client.rhAAPAuthenticate({
          host: 'https://test.example.com',
          checkSSL: true,
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          callbackURL: 'https://callback.example.com',
          code: 'test-code',
        });

        expect(result.session.accessToken).toBe('test-access-token');
        expect(result.session.tokenType).toBe('Bearer');
        expect(result.session.refreshToken).toBe('test-refresh-token');
      });

      it('should authenticate with refresh token', async () => {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            access_token: 'new-access-token',
            token_type: 'Bearer',
            scope: 'read write',
            expires_in: 3600,
            refresh_token: 'new-refresh-token',
          }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await client.rhAAPAuthenticate({
          host: 'https://test.example.com',
          checkSSL: true,
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          callbackURL: 'https://callback.example.com',
          refreshToken: 'test-refresh-token',
        });

        expect(result.session.accessToken).toBe('new-access-token');
        expect(result.session.refreshToken).toBe('new-refresh-token');
      });

      it('should throw error when neither code nor refreshToken provided', async () => {
        await expect(
          client.rhAAPAuthenticate({
            host: 'https://test.example.com',
            checkSSL: true,
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
            callbackURL: 'https://callback.example.com',
          }),
        ).rejects.toThrow('You have to provide code or refreshToken');
      });

      it('should handle authentication failure', async () => {
        const mockResponse = {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: jest.fn().mockResolvedValue({ error: 'invalid_grant' }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        await expect(
          client.rhAAPAuthenticate({
            host: 'https://test.example.com',
            checkSSL: true,
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
            callbackURL: 'https://callback.example.com',
            code: 'invalid-code',
          }),
        ).rejects.toThrow('invalid_grant');
      });
    });

    describe('fetchProfile', () => {
      it('should fetch user profile successfully', async () => {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [
              {
                id: 1,
                username: 'testuser',
                email: 'test@example.com',
                first_name: 'Test',
                last_name: 'User',
              },
            ],
          }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await client.fetchProfile('test-token');

        expect(result).toEqual({
          provider: 'AAP oauth2',
          id: '1',
          username: 'testuser',
          email: 'test@example.com',
          displayName: 'Test User',
        });
      });

      it('should handle profile fetch error', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));

        await expect(client.fetchProfile('test-token')).rejects.toThrow(
          'Failed to retrieve profile data from RH AAP',
        );
      });

      it('should handle unsuccessful response', async () => {
        const mockResponse = {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
        };
        mockFetch.mockResolvedValue(mockResponse);

        await expect(client.fetchProfile('test-token')).rejects.toThrow(
          'Failed to retrieve profile data from RH AAP',
        );
      });

      it('should handle unexpected profile format', async () => {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [],
          }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        await expect(client.fetchProfile('test-token')).rejects.toThrow(
          'Profile data from RH AAP is in an unexpected format',
        );
      });

      it('should handle profile with missing names', async () => {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [
              {
                id: 123,
                username: 'testuser',
                email: 'test@example.com',
                first_name: '',
                last_name: null,
              },
            ],
          }),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const result = await client.fetchProfile('test-token');

        expect(result.displayName).toBe(' ');
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle organizations with production config', async () => {
      // Mock config to not have development but have production
      mockConfig.has = jest.fn().mockImplementation((key: string) => {
        return key === 'catalog.providers.rhaap.production';
      });

      const mockOrgsData = [
        {
          id: 1,
          name: 'TestOrg',
          namespace: 'testorg',
          related: {
            users:
              'https://test.example.com/api/gateway/v1/organizations/1/users/',
            teams:
              'https://test.example.com/api/gateway/v1/organizations/1/teams/',
          },
        },
      ];

      jest
        .spyOn(client as any, 'executeCatalogRequest')
        .mockResolvedValueOnce(mockOrgsData)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await client.getOrganizations(false);

      expect(result).toHaveLength(1);
      expect(result[0].organization.name).toBe('TestOrg');
    });

    it('should handle organizations without userAndTeamDetails', async () => {
      const mockOrgsData = [
        {
          id: 1,
          name: 'TestOrg',
          namespace: 'testorg',
        },
      ];

      jest
        .spyOn(client as any, 'executeCatalogRequest')
        .mockResolvedValueOnce(mockOrgsData);

      const result = await client.getOrganizations(false);

      expect(result).toHaveLength(1);
      expect(result[0].teams).toEqual([]);
      expect(result[0].users).toEqual([]);
    });

    it('should handle organizations with teams but no users URL', async () => {
      const mockOrgsData = [
        {
          id: 1,
          name: 'TestOrg',
          namespace: 'testorg',
          related: {
            teams:
              'https://test.example.com/api/gateway/v1/organizations/1/teams/',
          },
        },
      ];

      const mockTeamsData = [
        {
          id: 1,
          organization: 1,
          name: 'Test Team',
          description: 'A test team',
          related: {},
        },
      ];

      jest
        .spyOn(client as any, 'executeCatalogRequest')
        .mockResolvedValueOnce(mockOrgsData)
        .mockResolvedValueOnce(mockTeamsData)
        .mockResolvedValueOnce([]);

      const result = await client.getOrganizations(true);

      expect(result).toHaveLength(1);
      expect(result[0].teams).toHaveLength(1);
    });
  });
});
