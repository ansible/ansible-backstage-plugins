import { LoggerService } from '@backstage/backend-plugin-api';
import { buildLaunchPayload } from './jobTemplateHelpers';
import { LaunchJobTemplate } from '../../types';

describe('jobTemplateHelpers', () => {
  let mockLogger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      child: jest.fn(),
    } as any;
  });

  describe('buildLaunchPayload', () => {
    it('should build payload with all fields populated', () => {
      const payload: Omit<LaunchJobTemplate, 'token'> = {
        template: 'test-template',
        extraVariables: { key: 'value' },
        inventory: { id: 1, name: 'test-inventory' },
        jobType: 'run',
        executionEnvironment: {
          id: 2,
          environmentName: 'test-ee',
          organization: { id: 1, name: 'test-org' },
          image: 'test-image',
          pull: 'always',
        },
        forks: 5,
        limit: 'webservers',
        verbosity: { id: 3, name: 'verbose' },
        jobSliceCount: 2,
        timeout: 300,
        diffMode: true,
        jobTags: 'tag1,tag2',
        skipTags: 'skip1',
        credentials: [
          {
            id: 10,
            type: 'ssh',
            name: 'SSH Key',
            credential_type: 1,
            summary_fields: { credential_type: { id: 1, name: 'ssh' } },
          },
        ],
      };

      const result = buildLaunchPayload(payload, mockLogger);

      expect(result).toEqual({
        extra_vars: { key: 'value' },
        inventory: 1,
        job_type: 'run',
        execution_environment: 2,
        forks: 5,
        limit: 'webservers',
        verbosity: 3,
        job_slice_count: 2,
        timeout: 300,
        diff_mode: true,
        job_tags: 'tag1,tag2',
        skip_tags: 'skip1',
        credentials: [10],
      });
    });

    it('should build minimal payload with only required fields', () => {
      const payload: Omit<LaunchJobTemplate, 'token'> = {
        template: 'test-template',
      };

      const result = buildLaunchPayload(payload, mockLogger);

      expect(result).toEqual({
        extra_vars: '',
      });
    });

    it('should handle forks=0 and timeout=0', () => {
      const payload: Omit<LaunchJobTemplate, 'token'> = {
        template: 'test-template',
        forks: 0,
        timeout: 0,
        jobSliceCount: 0,
      };

      const result = buildLaunchPayload(payload, mockLogger);

      expect(result).toEqual({
        extra_vars: '',
        forks: 0,
        timeout: 0,
        job_slice_count: 0,
      });
    });

    it('should handle diffMode=false explicitly', () => {
      const payload: Omit<LaunchJobTemplate, 'token'> = {
        template: 'test-template',
        diffMode: false,
      };

      const result = buildLaunchPayload(payload, mockLogger);

      expect(result).toEqual({
        extra_vars: '',
        diff_mode: false,
      });
    });

    it('should filter out credentials without id', () => {
      const payload: Omit<LaunchJobTemplate, 'token'> = {
        template: 'test-template',
        credentials: [
          {
            id: 10,
            type: 'ssh',
            name: 'SSH Key',
            credential_type: 1,
            summary_fields: { credential_type: { id: 1, name: 'ssh' } },
          },
          {
            id: undefined as any,
            type: 'vault',
            name: 'Invalid',
            credential_type: 3,
            summary_fields: { credential_type: { id: 3, name: 'vault' } },
          },
          {
            id: 20,
            type: 'aws',
            name: 'AWS Creds',
            credential_type: 2,
            summary_fields: { credential_type: { id: 2, name: 'aws' } },
          },
        ],
      };

      const result = buildLaunchPayload(payload, mockLogger);

      expect(result.credentials).toEqual([10, 20]);
    });

    it('should throw error when duplicate credential types are provided', () => {
      const payload: Omit<LaunchJobTemplate, 'token'> = {
        template: 'test-template',
        credentials: [
          {
            id: 10,
            type: 'ssh',
            name: 'SSH Key 1',
            credential_type: 1,
            summary_fields: { credential_type: { id: 1, name: 'ssh' } },
          },
          {
            id: 11,
            type: 'ssh',
            name: 'SSH Key 2',
            credential_type: 1,
            summary_fields: { credential_type: { id: 1, name: 'ssh' } },
          },
        ],
      };

      expect(() => buildLaunchPayload(payload, mockLogger)).toThrow(
        'Cannot assign multiple credentials of the same type. Duplicated credential types are: ssh',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cannot assign multiple credentials of the same type. Duplicated credential types are: ssh',
      );
    });

    it('should handle credentials with missing credential_type field', () => {
      const payload: Omit<LaunchJobTemplate, 'token'> = {
        template: 'test-template',
        credentials: [
          {
            id: 10,
            type: 'ssh',
            name: 'SSH Key',
            credential_type: undefined as any,
            summary_fields: { credential_type: { id: 1, name: 'ssh' } },
          },
          {
            id: 20,
            type: 'aws',
            name: 'AWS Creds',
            credential_type: 2,
            summary_fields: { credential_type: { id: 2, name: 'aws' } },
          },
        ],
      };

      const result = buildLaunchPayload(payload, mockLogger);

      expect(result.credentials).toEqual([10, 20]);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should use credential name when credential_type name is missing', () => {
      const payload: Omit<LaunchJobTemplate, 'token'> = {
        template: 'test-template',
        credentials: [
          {
            id: 10,
            type: 'custom',
            name: 'My Custom Cred',
            credential_type: 1,
            summary_fields: {},
          },
          {
            id: 11,
            type: 'custom',
            name: 'Another Custom Cred',
            credential_type: 1,
            summary_fields: {},
          },
        ],
      };

      expect(() => buildLaunchPayload(payload, mockLogger)).toThrow(
        'Cannot assign multiple credentials of the same type. Duplicated credential types are: Another Custom Cred',
      );
    });

    it('should use "Unknown" when both credential_type name and credential name are missing', () => {
      const payload: Omit<LaunchJobTemplate, 'token'> = {
        template: 'test-template',
        credentials: [
          {
            id: 10,
            type: 'unknown',
            name: undefined as any,
            credential_type: 1,
            summary_fields: {},
          },
          {
            id: 11,
            type: 'unknown',
            name: undefined as any,
            credential_type: 1,
            summary_fields: {},
          },
        ],
      };

      expect(() => buildLaunchPayload(payload, mockLogger)).toThrow(
        'Cannot assign multiple credentials of the same type. Duplicated credential types are: Unknown',
      );
    });

    it('should handle empty credentials array', () => {
      const payload: Omit<LaunchJobTemplate, 'token'> = {
        template: 'test-template',
        credentials: [],
      };

      const result = buildLaunchPayload(payload, mockLogger);

      expect(result.credentials).toBeUndefined();
    });

    it('should handle verbosity id of 0', () => {
      const payload: Omit<LaunchJobTemplate, 'token'> = {
        template: 'test-template',
        verbosity: { id: 0, name: 'normal' },
      };

      const result = buildLaunchPayload(payload, mockLogger);

      expect(result.verbosity).toBe(0);
    });

    it('should not include fields when they are undefined', () => {
      const payload: Omit<LaunchJobTemplate, 'token'> = {
        template: 'test-template',
        inventory: undefined,
        jobType: undefined,
        forks: undefined,
      };

      const result = buildLaunchPayload(payload, mockLogger);

      expect(result).toEqual({
        extra_vars: '',
      });
      expect(result.inventory).toBeUndefined();
      expect(result.job_type).toBeUndefined();
      expect(result.forks).toBeUndefined();
    });
  });
});
