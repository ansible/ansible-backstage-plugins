import {
  organizationParser,
  teamParser,
  userParser,
  aapJobTemplateParser,
  scmCollectionParser,
  repositoryParser,
} from './entityParser';
import {
  ANNOTATION_LOCATION,
  ANNOTATION_ORIGIN_LOCATION,
} from '@backstage/catalog-model';
import {
  Organization,
  Team,
  User,
  IJobTemplate,
  ISurvey,
} from '@ansible/backstage-rhaap-common';
import type { RepositoryInfo } from '@ansible/backstage-rhaap-common';
import type {
  DiscoveredGalaxyFile,
  AnsibleGitContentsSourceConfig,
} from './types';

describe('entityParser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('organizationParser', () => {
    it('should parse organization data correctly', () => {
      const mockOrg: Organization = {
        id: 1,
        name: 'Test Organization',
      };
      const options = {
        baseUrl: 'https://example.com',
        nameSpace: 'test-namespace',
        org: mockOrg,
        orgMembers: ['user1', 'user2'],
        teams: ['team1', 'team2'],
      };
      const result = organizationParser(options);
      expect(result).toEqual({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Group',
        metadata: {
          namespace: 'test-namespace',
          name: 'test-organization',
          title: 'Test Organization',
          annotations: {
            [ANNOTATION_LOCATION]:
              'url:https://example.com/access/organizations/1/details',
            [ANNOTATION_ORIGIN_LOCATION]:
              'url:https://example.com/access/organizations/1/details',
          },
        },
        spec: {
          type: 'organization',
          children: ['team1', 'team2'],
          members: ['user1', 'user2'],
        },
      });
    });
    it('should handle organization with special characters in name', () => {
      const mockOrg: Organization = {
        id: 2,
        name: 'Test Org With Special!@#$%^&*()_+Characters',
      };
      const options = {
        baseUrl: 'https://example.com',
        nameSpace: 'test-namespace',
        org: mockOrg,
        orgMembers: [],
        teams: [],
      };
      const result = organizationParser(options);
      expect(result.metadata.name).toBe('test-org-with-special_characters');
      expect(result.metadata.title).toBe(
        'Test Org With Special!@#$%^&*()_+Characters',
      );
    });
  });
  describe('teamParser', () => {
    it('should parse team data correctly', () => {
      const mockTeam: Team = {
        id: 1,
        name: 'Test Team',
        organization: 1,
        description: 'A test team',
        groupName: 'test-team-group',
      };
      const options = {
        baseUrl: 'https://example.com',
        nameSpace: 'test-namespace',
        team: mockTeam,
        teamMembers: ['user1', 'user2', 'user3'],
      };
      const result = teamParser(options);
      expect(result).toEqual({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Group',
        metadata: {
          namespace: 'test-namespace',
          name: 'test-team-group',
          title: 'Test Team',
          description: 'A test team',
          annotations: {
            [ANNOTATION_LOCATION]:
              'url:https://example.com/access/teams/1/details',
            [ANNOTATION_ORIGIN_LOCATION]:
              'url:https://example.com/access/teams/1/details',
          },
        },
        spec: {
          type: 'team',
          children: [],
          members: ['user1', 'user2', 'user3'],
        },
      });
    });
    it('should handle team with no description', () => {
      const mockTeam: Team = {
        id: 2,
        name: 'Another Team',
        organization: 1,
        description: '',
        groupName: 'another-team',
      };
      const options = {
        baseUrl: 'https://example.com',
        nameSpace: 'test-namespace',
        team: mockTeam,
        teamMembers: [],
      };
      const result = teamParser(options);
      expect(result.metadata.description).toBe('');
      expect((result.spec as any).members).toEqual([]);
    });
  });
  describe('userParser', () => {
    it('should parse user data correctly with first and last name', () => {
      const mockUser: User = {
        id: 1,
        url: 'https://example.com/users/1',
        username: 'johndoe',
        email: 'john.doe@example.com',
        first_name: 'John',
        last_name: 'Doe',
        is_superuser: false,
      };
      const options = {
        baseUrl: 'https://example.com',
        nameSpace: 'test-namespace',
        user: mockUser,
        groupMemberships: ['group1', 'group2'],
      };
      const result = userParser(options);
      expect(result).toEqual({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'User',
        metadata: {
          namespace: 'test-namespace',
          name: 'johndoe',
          title: 'John Doe',
          annotations: {
            'aap.platform/is_superuser': 'false',
            [ANNOTATION_LOCATION]:
              'url:https://example.com/access/users/1/details',
            [ANNOTATION_ORIGIN_LOCATION]:
              'url:https://example.com/access/users/1/details',
          },
        },
        spec: {
          profile: {
            username: 'johndoe',
            displayName: 'John Doe',
            email: 'john.doe@example.com',
          },
          memberOf: ['group1', 'group2'],
        },
      });
    });
    it('should handle user with no first or last name', () => {
      const mockUser: User = {
        id: 2,
        url: 'https://example.com/users/2',
        username: 'janedoe',
        email: 'jane.doe@example.com',
        first_name: '',
        last_name: '',
        is_superuser: true,
      };
      const options = {
        baseUrl: 'https://example.com',
        nameSpace: 'test-namespace',
        user: mockUser,
        groupMemberships: [],
      };
      const result = userParser(options);
      expect(result.metadata.title).toBe('janedoe');
      expect((result.spec as any).profile.displayName).toBe('janedoe');
    });
    it('should handle user with no email', () => {
      const mockUser: User = {
        id: 3,
        url: 'https://example.com/users/3',
        username: 'testuser',
        email: '',
        first_name: 'Test',
        last_name: 'User',
        is_superuser: false,
      };
      const options = {
        baseUrl: 'https://example.com',
        nameSpace: 'test-namespace',
        user: mockUser,
        groupMemberships: ['group1'],
      };
      const result = userParser(options);
      expect((result.spec as any).profile.email).toBe(' ');
    });
    it('should handle user with only first name', () => {
      const mockUser: User = {
        id: 4,
        url: 'https://example.com/users/4',
        username: 'firstonly',
        email: 'first@example.com',
        first_name: 'First',
        last_name: '',
        is_superuser: false,
      };
      const options = {
        baseUrl: 'https://example.com',
        nameSpace: 'test-namespace',
        user: mockUser,
        groupMemberships: [],
      };
      const result = userParser(options);
      expect(result.metadata.title).toBe('First ');
      expect((result.spec as any).profile.displayName).toBe('First ');
    });
    it('should handle user with undefined is_superuser', () => {
      const mockUser: User = {
        id: 1,
        url: 'https://example.com/users/1',
        username: 'testuser',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        is_superuser: undefined as any,
      };

      const options = {
        baseUrl: 'https://example.com',
        nameSpace: 'test-namespace',
        user: mockUser,
        groupMemberships: ['group1'],
      };

      const result = userParser(options);

      // Should not include aap-admins group
      expect((result.spec as any).memberOf).toEqual(['group1']);

      // Should not include is_superuser annotation when undefined
      expect(result.metadata.annotations).not.toHaveProperty(
        'aap.platform/is_superuser',
      );
    });
  });

  describe('aapJobTemplateParser', () => {
    it('should delegate to generateTemplate function', () => {
      const mockJob: IJobTemplate = {
        id: 1,
        name: 'Test Job Template',
        description: 'A test job template',
        type: 'job_template',
        job_type: 'run',
        url: 'https://example.com/job_templates/1',
        created: '2023-01-01T00:00:00Z',
        modified: '2023-01-01T00:00:00Z',
        status: 'successful',
        verbosity: 0,
        job_tags: '',
        skip_tags: '',
        inventory: 1,
        job_slice_count: 1,
        last_job_failed: false,
        last_job_run: null,
        limit: '',
        next_job_run: '',
        playbook: 'test.yml',
        prevent_instance_group_fallback: false,
        scm_branch: '',
        survey_enabled: false,
        timeout: 0,
        use_fact_cache: false,
        host_config_key: '',
        extra_vars: '{}',
        diff_mode: false,
        forks: 5,
        become_enabled: false,
        ask_variables_on_launch: false,
        ask_verbosity_on_launch: false,
        ask_scm_branch_on_launch: false,
        ask_skip_tags_on_launch: false,
        ask_timeout_on_launch: false,
        ask_tags_on_launch: false,
        allow_simultaneous: false,
        ask_labels_on_launch: false,
        ask_limit_on_launch: false,
        ask_job_slice_count_on_launch: false,
        ask_job_type_on_launch: false,
        ask_credential_on_launch: false,
        ask_diff_mode_on_launch: false,
        ask_forks_on_launch: false,
        ask_instance_groups_on_launch: false,
        ask_execution_environment_on_launch: false,
        ask_inventory_on_launch: false,
        related: {
          callback: '',
          named_url: '',
          created_by: '',
          modified_by: '',
          labels: '',
          inventory: '',
          project: '',
          organization: '',
          credentials: '',
          last_job: '',
          jobs: '',
          schedules: '',
          activity_stream: '',
          launch: '',
          webhook_key: '',
          webhook_receiver: '',
          notification_templates_started: '',
          notification_templates_success: '',
          notification_templates_error: '',
          access_list: '',
          survey_spec: '',
          object_roles: '',
          instance_groups: '',
          slice_workflow_jobs: '',
          copy: '',
        },
        summary_fields: {
          inventory: {
            id: 1,
            name: 'Test Inventory',
            description: 'Test inventory description',
            has_active_failures: false,
            total_hosts: 5,
            hosts_with_active_failures: 0,
            total_groups: 1,
            has_inventory_sources: false,
            total_inventory_sources: 0,
            inventory_sources_with_failures: 0,
            organization_id: 1,
            kind: 'inventory',
          },
          project: {
            id: 1,
            name: 'Test Project',
          },
          last_job: {
            id: 1,
            name: 'Test Job',
            description: 'Test job description',
            finished: '2023-01-01T00:00:00Z',
            status: 'successful',
            failed: false,
          },
          last_update: {
            id: 1,
            name: 'Test Update',
            description: 'Test update description',
            status: 'successful',
            failed: false,
          },
          created_by: {
            id: 1,
            username: 'testuser',
            first_name: 'Test',
            last_name: 'User',
          },
          modified_by: {
            id: 1,
            username: 'testuser',
            first_name: 'Test',
            last_name: 'User',
          },
          object_roles: {
            admin_role: {
              description: 'Admin role',
              name: 'Admin',
              id: 1,
            },
            execute_role: {
              description: 'Execute role',
              name: 'Execute',
              id: 2,
            },
            read_role: {
              description: 'Read role',
              name: 'Read',
              id: 3,
            },
          },
          user_capabilities: {
            edit: true,
            delete: true,
            start: true,
            schedule: true,
            copy: true,
          },
          labels: {
            count: 0,
            results: [],
          },
          resolved_environment: {
            id: 1,
            name: 'Test Environment',
            description: 'Test environment description',
            image: 'test-image:latest',
          },
          recent_jobs: [],
          credentials: [],
          webhook_credential: {
            id: 1,
            name: 'Test Credential',
            description: 'Test credential description',
            kind: 'ssh',
            cloud: false,
            credential_type: 1,
            summary_fields: {
              credential_type: {
                id: 1,
                name: 'example',
              },
            },
            type: 'credential',
          },
        },
        webhook_credential: 1,
        webhook_url: '',
        webhook_key: '',
        webhook_service: 'github',
        project: 1,
      };
      const mockSurvey: ISurvey = {
        name: 'Test Survey',
        description: 'A test survey',
        spec: [],
      };
      const options = {
        baseUrl: 'https://example.com',
        nameSpace: 'test-namespace',
        job: mockJob,
        survey: mockSurvey,
        instanceGroup: [],
      };
      const result = aapJobTemplateParser(options); // The function should return a Template entity
      expect(result.apiVersion).toBe('scaffolder.backstage.io/v1beta3');
      expect(result.kind).toBe('Template');
      expect(result.metadata.name).toBe('test-job-template');
      expect(result.metadata.title).toBe('Test Job Template');
      expect(result.metadata.description).toBe('A test job template');
    });
    it('should handle job template with null survey', () => {
      const mockJob: IJobTemplate = {
        id: 2,
        name: 'Job Without Survey',
        description: 'A job template without survey',
        type: 'job_template',
        job_type: 'run',
        url: 'https://example.com/job_templates/2',
        created: '2023-01-01T00:00:00Z',
        modified: '2023-01-01T00:00:00Z',
        status: 'successful',
        verbosity: 0,
        job_tags: '',
        skip_tags: '',
        inventory: 1,
        job_slice_count: 1,
        last_job_failed: false,
        last_job_run: null,
        limit: '',
        next_job_run: '',
        playbook: 'test.yml',
        prevent_instance_group_fallback: false,
        scm_branch: '',
        survey_enabled: false,
        timeout: 0,
        use_fact_cache: false,
        host_config_key: '',
        extra_vars: '{}',
        diff_mode: false,
        forks: 5,
        become_enabled: false,
        ask_variables_on_launch: false,
        ask_verbosity_on_launch: false,
        ask_scm_branch_on_launch: false,
        ask_skip_tags_on_launch: false,
        ask_timeout_on_launch: false,
        ask_tags_on_launch: false,
        allow_simultaneous: false,
        ask_labels_on_launch: false,
        ask_limit_on_launch: false,
        ask_job_slice_count_on_launch: false,
        ask_job_type_on_launch: false,
        ask_credential_on_launch: false,
        ask_diff_mode_on_launch: false,
        ask_forks_on_launch: false,
        ask_instance_groups_on_launch: false,
        ask_execution_environment_on_launch: false,
        ask_inventory_on_launch: false,
        related: {
          callback: '',
          named_url: '',
          created_by: '',
          modified_by: '',
          labels: '',
          inventory: '',
          project: '',
          organization: '',
          credentials: '',
          last_job: '',
          jobs: '',
          schedules: '',
          activity_stream: '',
          launch: '',
          webhook_key: '',
          webhook_receiver: '',
          notification_templates_started: '',
          notification_templates_success: '',
          notification_templates_error: '',
          access_list: '',
          survey_spec: '',
          object_roles: '',
          instance_groups: '',
          slice_workflow_jobs: '',
          copy: '',
        },
        summary_fields: {
          inventory: {
            id: 1,
            name: 'Test Inventory',
            description: 'Test inventory description',
            has_active_failures: false,
            total_hosts: 5,
            hosts_with_active_failures: 0,
            total_groups: 1,
            has_inventory_sources: false,
            total_inventory_sources: 0,
            inventory_sources_with_failures: 0,
            organization_id: 1,
            kind: 'inventory',
          },
          project: {
            id: 1,
            name: 'Test Project',
          },
          last_job: {
            id: 1,
            name: 'Test Job',
            description: 'Test job description',
            finished: '2023-01-01T00:00:00Z',
            status: 'successful',
            failed: false,
          },
          last_update: {
            id: 1,
            name: 'Test Update',
            description: 'Test update description',
            status: 'successful',
            failed: false,
          },
          created_by: {
            id: 1,
            username: 'testuser',
            first_name: 'Test',
            last_name: 'User',
          },
          modified_by: {
            id: 1,
            username: 'testuser',
            first_name: 'Test',
            last_name: 'User',
          },
          object_roles: {
            admin_role: {
              description: 'Admin role',
              name: 'Admin',
              id: 1,
            },
            execute_role: {
              description: 'Execute role',
              name: 'Execute',
              id: 2,
            },
            read_role: {
              description: 'Read role',
              name: 'Read',
              id: 3,
            },
          },
          user_capabilities: {
            edit: true,
            delete: true,
            start: true,
            schedule: true,
            copy: true,
          },
          labels: {
            count: 0,
            results: [],
          },
          resolved_environment: {
            id: 1,
            name: 'Test Environment',
            description: 'Test environment description',
            image: 'test-image:latest',
          },
          recent_jobs: [],
          credentials: [],
          webhook_credential: {
            id: 1,
            name: 'Test Credential',
            description: 'Test credential description',
            kind: 'ssh',
            cloud: false,
            credential_type: 1,
            summary_fields: {
              credential_type: {
                id: 1,
                name: 'example',
              },
            },
            type: 'credential',
          },
        },
        webhook_credential: 1,
        webhook_url: '',
        webhook_key: '',
        webhook_service: 'github',
        project: 1,
      };
      const options = {
        baseUrl: 'https://example.com',
        nameSpace: 'test-namespace',
        job: mockJob,
        survey: null, // Test with null survey
        instanceGroup: [],
      };
      const result = aapJobTemplateParser(options); // The function should still return a Template entity
      expect(result.apiVersion).toBe('scaffolder.backstage.io/v1beta3');
      expect(result.kind).toBe('Template');
      expect(result.metadata.name).toBe('job-without-survey');
      expect(result.metadata.title).toBe('Job Without Survey');
      expect(result.metadata.description).toBe('A job template without survey');
    });
  });

  describe('scmCollectionParser', () => {
    const mockRepository: RepositoryInfo = {
      name: 'test-repo',
      fullPath: 'test-org/test-repo',
      defaultBranch: 'main',
      url: 'https://github.com/test-org/test-repo',
    };

    const mockSourceConfig: AnsibleGitContentsSourceConfig = {
      env: 'development',
      scmProvider: 'github',
      host: 'github.com',
      hostName: 'github',
      organization: 'test-org',
      enabled: true,
      schedule: { frequency: { minutes: 30 }, timeout: { minutes: 10 } },
    };

    const mockGalaxyFile: DiscoveredGalaxyFile = {
      repository: mockRepository,
      ref: 'main',
      refType: 'branch',
      path: 'galaxy.yml',
      content: 'namespace: test_ns\nname: test_collection\nversion: 1.0.0',
      metadata: {
        namespace: 'test_ns',
        name: 'test_collection',
        version: '1.0.0',
      },
    };

    it('should parse collection data correctly', () => {
      const result = scmCollectionParser({
        galaxyFile: mockGalaxyFile,
        sourceConfig: mockSourceConfig,
        sourceLocation: 'url:https://github.com/test-org/test-repo',
      });

      expect(result.kind).toBe('Component');
      expect(result.spec?.type).toBe('ansible-collection');
      expect(result.spec?.collection_namespace).toBe('test_ns');
      expect(result.spec?.collection_name).toBe('test_collection');
      expect(result.spec?.collection_version).toBe('1.0.0');
      expect(result.spec?.collection_full_name).toBe('test_ns.test_collection');
    });

    it('should set lifecycle to development for branches', () => {
      const result = scmCollectionParser({
        galaxyFile: mockGalaxyFile,
        sourceConfig: mockSourceConfig,
        sourceLocation: 'url:https://github.com/test-org/test-repo',
      });

      expect(result.spec?.lifecycle).toBe('development');
    });

    it('should set lifecycle to production for tags', () => {
      const tagGalaxyFile = {
        ...mockGalaxyFile,
        refType: 'tag' as const,
        ref: 'v1.0.0',
      };
      const result = scmCollectionParser({
        galaxyFile: tagGalaxyFile,
        sourceConfig: mockSourceConfig,
        sourceLocation: 'url:https://github.com/test-org/test-repo',
      });

      expect(result.spec?.lifecycle).toBe('production');
    });

    it('should include discovery source ID annotation', () => {
      const result = scmCollectionParser({
        galaxyFile: mockGalaxyFile,
        sourceConfig: mockSourceConfig,
        sourceLocation: 'url:https://github.com/test-org/test-repo',
      });

      expect(
        result.metadata.annotations?.['ansible.io/discovery-source-id'],
      ).toBeDefined();
    });

    it('should sanitize and include galaxy tags', () => {
      const galaxyFileWithTags = {
        ...mockGalaxyFile,
        metadata: {
          ...mockGalaxyFile.metadata,
          tags: ['Cloud', 'AWS-Services', 'Special@Tag!'],
        },
      };

      const result = scmCollectionParser({
        galaxyFile: galaxyFileWithTags,
        sourceConfig: mockSourceConfig,
        sourceLocation: 'url:https://github.com/test-org/test-repo',
      });

      expect(result.metadata.tags).toContain('cloud');
      expect(result.metadata.tags).toContain('aws-services');
      expect(result.metadata.tags).toContain('github');
      expect(result.metadata.tags).toContain('ansible-collection');
    });

    it('should include unsanitized collection_tags in spec', () => {
      const galaxyFileWithTags = {
        ...mockGalaxyFile,
        metadata: {
          ...mockGalaxyFile.metadata,
          tags: ['Cloud', 'AWS-Services'],
        },
      };

      const result = scmCollectionParser({
        galaxyFile: galaxyFileWithTags,
        sourceConfig: mockSourceConfig,
        sourceLocation: 'url:https://github.com/test-org/test-repo',
      });

      expect(result.spec?.collection_tags).toEqual(['Cloud', 'AWS-Services']);
    });

    it('should include links when metadata has repository, docs, etc', () => {
      const galaxyFileWithLinks = {
        ...mockGalaxyFile,
        metadata: {
          ...mockGalaxyFile.metadata,
          repository: 'https://github.com/test/repo',
          documentation: 'https://docs.example.com',
          homepage: 'https://example.com',
          issues: 'https://github.com/test/repo/issues',
        },
      };

      const result = scmCollectionParser({
        galaxyFile: galaxyFileWithLinks,
        sourceConfig: mockSourceConfig,
        sourceLocation: 'url:https://github.com/test-org/test-repo',
      });

      expect(result.metadata.links).toHaveLength(4);
      expect(result.metadata.links).toContainEqual(
        expect.objectContaining({ title: 'Repository' }),
      );
      expect(result.metadata.links).toContainEqual(
        expect.objectContaining({ title: 'Documentation' }),
      );
    });

    it('should include readme URL when readme is specified', () => {
      const galaxyFileWithReadme = {
        ...mockGalaxyFile,
        metadata: {
          ...mockGalaxyFile.metadata,
          readme: 'README.md',
        },
      };

      const result = scmCollectionParser({
        galaxyFile: galaxyFileWithReadme,
        sourceConfig: mockSourceConfig,
        sourceLocation: 'url:https://github.com/test-org/test-repo',
      });

      expect(result.spec?.collection_readme_url).toBeDefined();
    });

    it('should include dependencies when present', () => {
      const galaxyFileWithDeps = {
        ...mockGalaxyFile,
        metadata: {
          ...mockGalaxyFile.metadata,
          dependencies: {
            'ansible.netcommon': '>=2.0.0',
            'ansible.utils': '>=1.0.0',
          },
        },
      };

      const result = scmCollectionParser({
        galaxyFile: galaxyFileWithDeps,
        sourceConfig: mockSourceConfig,
        sourceLocation: 'url:https://github.com/test-org/test-repo',
      });

      expect(result.spec?.collection_dependencies).toEqual({
        'ansible.netcommon': '>=2.0.0',
        'ansible.utils': '>=1.0.0',
      });
    });

    it('should include authors when present', () => {
      const galaxyFileWithAuthors = {
        ...mockGalaxyFile,
        metadata: {
          ...mockGalaxyFile.metadata,
          authors: ['Author One', 'Author Two'],
        },
      };

      const result = scmCollectionParser({
        galaxyFile: galaxyFileWithAuthors,
        sourceConfig: mockSourceConfig,
        sourceLocation: 'url:https://github.com/test-org/test-repo',
      });

      expect(result.spec?.collection_authors).toEqual([
        'Author One',
        'Author Two',
      ]);
    });

    it('should include license when present', () => {
      const galaxyFileWithLicense = {
        ...mockGalaxyFile,
        metadata: {
          ...mockGalaxyFile.metadata,
          license: 'GPL-3.0',
        },
      };

      const result = scmCollectionParser({
        galaxyFile: galaxyFileWithLicense,
        sourceConfig: mockSourceConfig,
        sourceLocation: 'url:https://github.com/test-org/test-repo',
      });

      expect(result.spec?.collection_license).toBe('GPL-3.0');
    });

    it('should join array licenses with comma', () => {
      const galaxyFileWithLicenses = {
        ...mockGalaxyFile,
        metadata: {
          ...mockGalaxyFile.metadata,
          license: ['MIT', 'Apache-2.0'],
        },
      };

      const result = scmCollectionParser({
        galaxyFile: galaxyFileWithLicenses,
        sourceConfig: mockSourceConfig,
        sourceLocation: 'url:https://github.com/test-org/test-repo',
      });

      expect(result.spec?.collection_license).toBe('MIT, Apache-2.0');
    });

    it('should build correct GitLab URL for gitlab provider', () => {
      const gitlabConfig: AnsibleGitContentsSourceConfig = {
        ...mockSourceConfig,
        scmProvider: 'gitlab',
        host: 'gitlab.com',
        hostName: 'gitlab',
      };

      const result = scmCollectionParser({
        galaxyFile: mockGalaxyFile,
        sourceConfig: gitlabConfig,
        sourceLocation: 'url:https://gitlab.com/test-org/test-repo',
      });

      expect(result.metadata.annotations?.['backstage.io/view-url']).toContain(
        '/-/blob/',
      );
    });

    it('should handle version as N/A in title', () => {
      const galaxyFileNoVersion = {
        ...mockGalaxyFile,
        metadata: {
          ...mockGalaxyFile.metadata,
          version: 'N/A',
        },
      };

      const result = scmCollectionParser({
        galaxyFile: galaxyFileNoVersion,
        sourceConfig: mockSourceConfig,
        sourceLocation: 'url:https://github.com/test-org/test-repo',
      });

      expect(result.metadata.title).toBe('test_ns.test_collection');
    });
  });

  describe('repositoryParser', () => {
    const mockRepository: RepositoryInfo = {
      name: 'test-repo',
      fullPath: 'test-org/test-repo',
      defaultBranch: 'main',
      description: 'Test repository description',
      url: 'https://github.com/test-org/test-repo',
    };

    const mockSourceConfig: AnsibleGitContentsSourceConfig = {
      env: 'development',
      scmProvider: 'github',
      host: 'github.com',
      hostName: 'github',
      organization: 'test-org',
      enabled: true,

      schedule: { frequency: { minutes: 30 }, timeout: { minutes: 10 } },
    };

    it('should parse repository data correctly', () => {
      const result = repositoryParser({
        repository: mockRepository,
        sourceConfig: mockSourceConfig,
        collectionCount: 5,
      });

      expect(result.kind).toBe('Component');
      expect(result.spec?.type).toBe('git-repository');
      expect(result.spec?.lifecycle).toBe('production');
      expect(result.spec?.repository_name).toBe('test-repo');
      expect(result.spec?.repository_default_branch).toBe('main');
      expect(result.spec?.repository_collection_count).toBe(5);
    });

    it('should include discovery source ID annotation', () => {
      const result = repositoryParser({
        repository: mockRepository,
        sourceConfig: mockSourceConfig,
        collectionCount: 1,
      });

      expect(
        result.metadata.annotations?.['ansible.io/discovery-source-id'],
      ).toBeDefined();
    });

    it('should include repository tags', () => {
      const result = repositoryParser({
        repository: mockRepository,
        sourceConfig: mockSourceConfig,
        collectionCount: 1,
      });

      expect(result.metadata.tags).toContain('git-repository');
      expect(result.metadata.tags).toContain('github');
      expect(result.metadata.tags).toContain('ansible-collections-source');
    });

    it('should include collection entity names when provided', () => {
      const result = repositoryParser({
        repository: mockRepository,
        sourceConfig: mockSourceConfig,
        collectionCount: 2,
        collectionEntityNames: ['collection-a', 'collection-b'],
      });

      expect(result.spec?.repository_collections).toEqual([
        'collection-a',
        'collection-b',
      ]);
      expect(result.spec?.dependsOn).toEqual([
        'component:default/collection-a',
        'component:default/collection-b',
      ]);
    });

    it('should use repository URL when available', () => {
      const result = repositoryParser({
        repository: mockRepository,
        sourceConfig: mockSourceConfig,
        collectionCount: 1,
      });

      expect(result.metadata.links?.[0].url).toBe(
        'https://github.com/test-org/test-repo',
      );
    });

    it('should construct URL when repository URL is not available', () => {
      const repoWithoutUrl = { ...mockRepository, url: '' };

      const result = repositoryParser({
        repository: repoWithoutUrl,
        sourceConfig: mockSourceConfig,
        collectionCount: 1,
      });

      expect(result.metadata.annotations?.['backstage.io/view-url']).toBe(
        'https://github.com/test-org/test-repo',
      );
    });

    it('should use repository description when available', () => {
      const result = repositoryParser({
        repository: mockRepository,
        sourceConfig: mockSourceConfig,
        collectionCount: 1,
      });

      expect(result.metadata.description).toBe('Test repository description');
    });

    it('should use default description when not available', () => {
      const repoWithoutDesc = { ...mockRepository, description: undefined };

      const result = repositoryParser({
        repository: repoWithoutDesc,
        sourceConfig: mockSourceConfig,
        collectionCount: 1,
      });

      expect(result.metadata.description).toContain(
        'Git repository containing Ansible collections',
      );
    });

    it('should set correct icon for gitlab provider', () => {
      const gitlabConfig: AnsibleGitContentsSourceConfig = {
        ...mockSourceConfig,
        scmProvider: 'gitlab',
      };

      const result = repositoryParser({
        repository: mockRepository,
        sourceConfig: gitlabConfig,
        collectionCount: 1,
      });

      expect(result.metadata.links?.[0].icon).toBe('gitlab');
    });
  });
});
