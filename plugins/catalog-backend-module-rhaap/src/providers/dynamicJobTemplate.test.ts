import {
  getPromptForm,
  getJobTypeProps,
  getInventoryProps,
  getEEProps,
  getCredentialsProps,
  getLabelsProps,
  getForksProps,
  getLimitProps,
  getVerbosityProps,
  getJobSliceCountProps,
  getTimeoutProps,
  getDiffModeProps,
  getInstanceGroupsProps,
  getPromptFormDetails,
  getSurveyDetails,
  generateTemplate,
} from './dynamicJobTemplate';
import { IJobTemplate, ISurvey, ISpec } from '@ansible/backstage-rhaap-common';
import {
  ANNOTATION_LOCATION,
  ANNOTATION_ORIGIN_LOCATION,
} from '@backstage/catalog-model';

describe('dynamicJobTemplate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPromptForm', () => {
    it('should return the default prompt form structure', () => {
      const result = getPromptForm();

      expect(result).toEqual({
        title: 'Please enter the following details',
        required: ['token'],
        properties: {
          token: {
            title: 'Token',
            type: 'string',
            description: 'Oauth2 token',
            'ui:field': 'AAPTokenField',
            'ui:widget': 'hidden',
            'ui:backstage': {
              review: {
                show: false,
              },
            },
            'ui:options': {
              disabled: true,
              hidden: true,
            },
          },
        },
      });
    });
  });

  describe('getJobTypeProps', () => {
    it('should return job type properties with correct default', () => {
      const result = getJobTypeProps('run');

      expect(result).toEqual({
        title: 'Job type',
        description: 'The type of job to launch',
        type: 'string',
        enum: ['run', 'check'],
        default: 'run',
      });
    });

    it('should handle check job type', () => {
      const result = getJobTypeProps('check');

      expect(result.default).toBe('check');
      expect(result.enum).toEqual(['run', 'check']);
    });
  });

  describe('getInventoryProps', () => {
    it('should return inventory properties with default value', () => {
      const inventory = { id: 1, name: 'test-inventory' };
      const result = getInventoryProps(inventory);

      expect(result).toEqual({
        title: 'Inventory',
        description:
          'Please enter the inventory you want to use the services on',
        resource: 'inventories',
        'ui:field': 'AAPResourcePicker',
        default: inventory,
      });
    });

    it('should handle empty inventory object', () => {
      const result = getInventoryProps({});

      expect(result.default).toEqual({});
      expect(result.resource).toBe('inventories');
    });
  });

  describe('getEEProps', () => {
    it('should return execution environment properties with selected EE', () => {
      const selectedEE = { id: 1, name: 'test-ee' };
      const orgId = 123;
      const result = getEEProps(selectedEE, orgId);

      expect(result).toEqual({
        title: 'Execution environment',
        'ui:field': 'AAPResourcePicker',
        resource: 'execution_environments:123',
        default: selectedEE,
      });
    });

    it('should handle undefined selectedEE', () => {
      const result = getEEProps(undefined, 123);

      expect(result).toEqual({
        title: 'Execution environment',
        'ui:field': 'AAPResourcePicker',
        resource: 'execution_environments:123',
      });
      expect(result.default).toBeUndefined();
    });

    it('should handle undefined orgId', () => {
      const selectedEE = { id: 1, name: 'test-ee' };
      const result = getEEProps(selectedEE, undefined);

      expect(result.resource).toBe('execution_environments:undefined');
    });
  });

  describe('getCredentialsProps', () => {
    it('should return credentials properties with default values', () => {
      const credentials = [
        { id: 1, name: 'cred1' },
        { id: 2, name: 'cred2' },
      ];
      const result = getCredentialsProps(credentials);

      expect(result).toEqual({
        title: 'Credentials',
        description:
          'Select credentials for accessing the nodes this job will be run against. You can only select one credential of each type.',
        type: 'array',
        'ui:field': 'AAPResourcePicker',
        resource: 'credentials',
        default: credentials,
      });
    });

    it('should handle empty credentials array', () => {
      const result = getCredentialsProps([]);

      expect(result.default).toEqual([]);
      expect(result.type).toBe('array');
    });
  });

  describe('getLabelsProps', () => {
    it('should return labels properties with default values', () => {
      const labels = [
        { id: 1, name: 'dev' },
        { id: 2, name: 'test' },
      ];
      const result = getLabelsProps(labels);

      expect(result).toEqual({
        title: 'Labels',
        description:
          'Optional labels that describe this job template, such as "dev" or "test". Labels can be used to group and filter job templates and completed jobs.',
        type: 'array',
        'ui:field': 'AAPResourcePicker',
        resource: 'labels',
        default: labels,
      });
    });
  });

  describe('getForksProps', () => {
    it('should return forks properties with default value', () => {
      const result = getForksProps(5);

      expect(result.title).toBe('Forks');
      expect(result.type).toBe('number');
      expect(result.default).toBe(5);
      expect(result.description).toContain(
        'parallel or simultaneous processes',
      );
    });
  });

  describe('getLimitProps', () => {
    it('should return limit properties with default value', () => {
      const result = getLimitProps('webservers');

      expect(result).toEqual({
        title: 'Limit',
        description:
          'Provide a host pattern to further constrain the list of hosts that will be managed or affected by the playbook.\n    Multiple patterns are allowed. Refer to Ansible documentation for more information and examples on patterns.',
        type: 'string',
        default: 'webservers',
      });
    });

    it('should handle empty limit string', () => {
      const result = getLimitProps('');

      expect(result.default).toBe('');
    });
  });

  describe('getVerbosityProps', () => {
    it('should return verbosity properties with default value', () => {
      const verbosity = { id: 1, name: 'Normal' };
      const result = getVerbosityProps(verbosity);

      expect(result).toEqual({
        title: 'Verbosity',
        description:
          'Control the level of output Ansible will produce as the playbook executes.',
        'ui:field': 'AAPResourcePicker',
        resource: 'verbosity',
        default: verbosity,
      });
    });
  });

  describe('getJobSliceCountProps', () => {
    it('should return job slice count properties with default value', () => {
      const result = getJobSliceCountProps(4);

      expect(result.title).toBe('Job slicing');
      expect(result.type).toBe('number');
      expect(result.default).toBe(4);
      expect(result.description).toContain(
        'Divide the work done by this job template',
      );
    });
  });

  describe('getTimeoutProps', () => {
    it('should return timeout properties with default value', () => {
      const result = getTimeoutProps(300);

      expect(result).toEqual({
        title: 'Timeout',
        description:
          'The amount of time (in seconds) to run before the job is canceled. Defaults to 0 for no job timeout.',
        type: 'number',
        default: 300,
      });
    });
  });

  describe('getDiffModeProps', () => {
    it('should return diff mode properties with default value', () => {
      const result = getDiffModeProps(true);

      expect(result).toEqual({
        title: 'Show changes',
        description:
          "If enabled, show the changes made by Ansible tasks, where supported.\n    This is equivalent to Ansible's --diff mode.",
        type: 'boolean',
        default: true,
      });
    });

    it('should handle false diff mode', () => {
      const result = getDiffModeProps(false);

      expect(result.default).toBe(false);
    });
  });

  describe('getInstanceGroupsProps', () => {
    it('should return instance groups properties with default values', () => {
      const instanceGroups = [
        {
          id: 1,
          name: 'group1',
          capacity: 100,
          consumed_capacity: 0,
          max_concurrent_jobs: 0,
          max_forks: 0,
          pod_spec_override: '',
          percent_capacity_remaining: 100.0,
          is_container_group: false,
          policy_instance_list: [],
          results: [],
          summary_fields: {
            object_roles: {
              admin_role: { description: 'Admin', name: 'Admin', id: 1 },
              update_role: { description: 'Update', name: 'Update', id: 2 },
              adhoc_role: { description: 'Adhoc', name: 'Adhoc', id: 3 },
              use_role: { description: 'Use', name: 'Use', id: 4 },
              read_role: { description: 'Read', name: 'Read', id: 5 },
            },
            user_capabilities: { edit: true, delete: false },
          },
        },
        {
          id: 2,
          name: 'group2',
          capacity: 200,
          consumed_capacity: 0,
          max_concurrent_jobs: 0,
          max_forks: 0,
          pod_spec_override: '',
          percent_capacity_remaining: 100.0,
          is_container_group: false,
          policy_instance_list: [],
          results: [],
          summary_fields: {
            object_roles: {
              admin_role: { description: 'Admin', name: 'Admin', id: 1 },
              update_role: { description: 'Update', name: 'Update', id: 2 },
              adhoc_role: { description: 'Adhoc', name: 'Adhoc', id: 3 },
              use_role: { description: 'Use', name: 'Use', id: 4 },
              read_role: { description: 'Read', name: 'Read', id: 5 },
            },
            user_capabilities: { edit: true, delete: false },
          },
        },
      ];
      const result = getInstanceGroupsProps(instanceGroups);

      expect(result).toEqual({
        title: 'Instance groups',
        description:
          'Select the instance groups for this job template to run on.',
        type: 'array',
        'ui:field': 'AAPResourcePicker',
        resource: 'instance_groups',
        default: ['1', '2'],
      });
    });
  });

  describe('getPromptFormDetails', () => {
    const mockJob: IJobTemplate = {
      id: 1,
      name: 'Test Job Template',
      description: 'A test job template',
      job_type: 'run',
      inventory: 1,
      project: 1,
      playbook: 'test.yml',
      scm_branch: '',
      forks: 5,
      limit: 'webservers',
      verbosity: 0,
      extra_vars: '{}',
      job_tags: '',
      skip_tags: '',
      timeout: 0,
      use_fact_cache: false,
      host_config_key: '',
      ask_scm_branch_on_launch: false,
      ask_diff_mode_on_launch: false,
      ask_variables_on_launch: false,
      ask_limit_on_launch: false,
      ask_tags_on_launch: false,
      ask_skip_tags_on_launch: false,
      ask_job_type_on_launch: false,
      ask_verbosity_on_launch: false,
      ask_inventory_on_launch: false,
      ask_credential_on_launch: false,
      ask_execution_environment_on_launch: false,
      survey_enabled: false,
      become_enabled: false,
      diff_mode: false,
      allow_simultaneous: false,
      job_slice_count: 1,
      webhook_service: 'github',
      webhook_credential: 1,
      prevent_instance_group_fallback: false,
      ask_labels_on_launch: false,
      ask_forks_on_launch: false,
      ask_job_slice_count_on_launch: false,
      ask_timeout_on_launch: false,
      ask_instance_groups_on_launch: false,
      organization: 1,
      last_job_run: null,
      last_job_failed: false,
      next_job_run: 'next-run-time',
      status: 'successful',
      execution_environment: 1,
      type: 'job_template',
      url: 'test-url',
      created: '2023-01-01T00:00:00Z',
      modified: '2023-01-01T00:00:00Z',
      webhook_url: '',
      webhook_key: '',
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
          total_hosts: 0,
          hosts_with_active_failures: 0,
          total_groups: 0,
          has_inventory_sources: false,
          total_inventory_sources: 0,
          inventory_sources_with_failures: 0,
          organization_id: 1,
          kind: 'inventory',
        },
        organization: {
          id: 1,
          name: 'Test Org',
          description: 'Test organization',
        },
        execution_environment: { id: 1, name: 'Test EE' },
        credentials: [
          {
            id: 1,
            name: 'Test Credential',
            description: 'Test credential description',
            kind: 'ssh',
            cloud: false,
          },
        ],
        labels: {
          count: 1,
          results: [
            {
              id: 1,
              name: 'test-label',
              organization: 1,
              type: 'label',
              url: 'test-url',
              created: '2023-01-01T00:00:00Z',
              modified: '2023-01-01T00:00:00Z',
              summary_fields: {
                created_by: {
                  username: 'test',
                  first_name: 'Test',
                  last_name: 'User',
                  id: 1,
                },
                modified_by: {
                  username: 'test',
                  first_name: 'Test',
                  last_name: 'User',
                  id: 1,
                },
                organization: {
                  id: 1,
                  name: 'Test Org',
                  description: 'Test organization',
                },
              },
            },
          ],
        },
        project: { id: 1, name: 'Test Project' },
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
        resolved_environment: {
          id: 1,
          name: 'Test Environment',
          description: 'Test environment description',
          image: 'test-image:latest',
        },
        recent_jobs: [],
        webhook_credential: {
          id: 1,
          name: 'Test Credential',
          description: 'Test credential description',
          kind: 'ssh',
          cloud: false,
        },
      },
    };

    it('should return prompt form and input vars for job with all ask_on_launch flags', () => {
      const jobWithAllFlags = {
        ...mockJob,
        ask_job_type_on_launch: true,
        ask_inventory_on_launch: true,
        ask_execution_environment_on_launch: true,
        ask_credential_on_launch: true,
        ask_labels_on_launch: true,
        ask_forks_on_launch: true,
        ask_limit_on_launch: true,
        ask_verbosity_on_launch: true,
        ask_job_slice_count_on_launch: true,
        ask_timeout_on_launch: true,
        ask_diff_mode_on_launch: true,
      };

      const [promptForm, inputVars] = getPromptFormDetails(jobWithAllFlags, []);

      expect(promptForm.title).toBe('Please enter the following details');
      expect(promptForm.required).toEqual(['token', 'job_type', 'inventory']);
      expect((promptForm.properties as any).token).toBeDefined();
      expect((promptForm.properties as any).job_type).toBeDefined();
      expect((promptForm.properties as any).inventory).toBeDefined();
      expect(
        (promptForm.properties as any).execution_environment,
      ).toBeDefined();
      expect((promptForm.properties as any).credentials).toBeDefined();
      expect((promptForm.properties as any).labels).toBeDefined();
      expect((promptForm.properties as any).forks).toBeDefined();
      expect((promptForm.properties as any).limit).toBeDefined();
      expect((promptForm.properties as any).verbosity).toBeDefined();
      expect((promptForm.properties as any).job_slice_count).toBeDefined();
      expect((promptForm.properties as any).timeout).toBeDefined();
      expect((promptForm.properties as any).diff_mode).toBeDefined();

      expect((inputVars as any).job_type).toBe('${{ parameters.job_type }}');
      expect((inputVars as any).inventory).toBe('${{ parameters.inventory }}');
      expect((inputVars as any).execution_environment).toBe(
        '${{ parameters.execution_environment }}',
      );
      expect((inputVars as any).credentials).toBe(
        '${{ parameters.credentials }}',
      );
      expect((inputVars as any).labels).toBe('${{ parameters.labels }}');
      expect((inputVars as any).forks).toBe('${{ parameters.forks }}');
      expect((inputVars as any).limit).toBe('${{ parameters.limit }}');
      expect((inputVars as any).verbosity).toBe('${{ parameters.verbosity }}');
      expect((inputVars as any).job_slice_count).toBe(
        '${{ parameters.job_slice_count }}',
      );
      expect((inputVars as any).timeout).toBe('${{ parameters.timeout }}');
      expect((inputVars as any).diff_mode).toBe('${{ parameters.diff_mode }}');
    });

    it('should return minimal prompt form for job with no ask_on_launch flags', () => {
      const [promptForm, inputVars] = getPromptFormDetails(mockJob, []);

      expect(promptForm.title).toBe('Please enter the following details');
      expect(promptForm.required).toEqual(['token']);
      expect((promptForm.properties as any).token).toBeDefined();
      expect((promptForm.properties as any).job_type).toBeUndefined();
      expect((promptForm.properties as any).inventory).toBeUndefined();

      expect(Object.keys(inputVars)).toHaveLength(0);
    });
  });

  describe('getSurveyDetails', () => {
    it('should return empty objects when survey is null', () => {
      const [surveyForm, extraVariables] = getSurveyDetails({}, null);

      expect(surveyForm).toEqual({});
      expect(extraVariables).toEqual({});
    });

    it('should process survey with various input types', () => {
      const mockSurvey: ISurvey = {
        name: 'Test Survey',
        description: 'A test survey',
        spec: [
          {
            question_name: 'Text Question',
            question_description: 'Enter some text',
            variable: 'text_var',
            type: 'text',
            required: true,
            default: 'default text',
            choices: [],
            min: 0,
            max: 100,
            new_question: false,
          },
          {
            question_name: 'Password Question',
            question_description: 'Enter password',
            variable: 'password_var',
            type: 'password',
            required: false,
            default: '',
            choices: [],
            min: 0,
            max: 100,
            new_question: false,
          },
          {
            question_name: 'Textarea Question',
            question_description: 'Enter long text',
            variable: 'textarea_var',
            type: 'textarea',
            required: true,
            default: 'default long text',
            choices: [],
            min: 0,
            max: 100,
            new_question: false,
          },
          {
            question_name: 'Multiple Choice Question',
            question_description: 'Select one',
            variable: 'choice_var',
            type: 'multiplechoice',
            required: true,
            default: 'option1',
            choices: ['option1', 'option2', 'option3'],
            min: 0,
            max: 100,
            new_question: false,
          },
          {
            question_name: 'Multi Select Question',
            question_description: 'Select multiple',
            variable: 'multiselect_var',
            type: 'multiselect',
            required: false,
            default: ['option1'],
            choices: ['option1', 'option2', 'option3'],
            min: 0,
            max: 100,
            new_question: false,
          },
        ] as ISpec[],
      };

      const [surveyForm, extraVariables] = getSurveyDetails({}, mockSurvey);

      expect(surveyForm.required).toEqual([
        'text_var',
        'textarea_var',
        'choice_var',
      ]);

      // Test text input
      expect(surveyForm.properties.text_var).toEqual({
        title: 'Text Question',
        description: 'Enter some text',
        type: 'string',
        default: 'default text',
      });

      // Test password input - Note: empty string default is falsy and won't be included
      expect(surveyForm.properties.password_var).toEqual({
        title: 'Password Question',
        description: 'Enter password',
        type: 'string',
        'ui:placeholder': 'Enter password...',
        'ui:field': 'Secret',
        'ui:backstage': {
          review: {
            show: false,
          },
        },
      });

      // Test textarea input
      expect(surveyForm.properties.textarea_var).toEqual({
        title: 'Textarea Question',
        description: 'Enter long text',
        type: 'string',
        'ui:widget': 'textarea',
        'ui:placeholder': 'Enter long text...',
        'ui:options': {
          rows: 5,
        },
        default: 'default long text',
      });

      // Test multiple choice
      expect(surveyForm.properties.choice_var).toEqual({
        title: 'Multiple Choice Question',
        description: 'Select one',
        type: 'string',
        enum: ['option1', 'option2', 'option3'],
        default: 'option1',
      });

      // Test multiselect
      expect(surveyForm.properties.multiselect_var).toEqual({
        title: 'Multi Select Question',
        description: 'Select multiple',
        type: 'array',
        'ui:widget': 'select',
        uniqueItems: true,
        items: {
          enum: ['option1', 'option2', 'option3'],
          type: 'string',
        },
        default: ['option1'],
      });

      // Test extra variables
      expect(extraVariables).toEqual({
        text_var: '${{ parameters.text_var }}',
        password_var: '${{ parameters.password_var }}',
        textarea_var: '${{ parameters.textarea_var }}',
        choice_var: '${{ parameters.choice_var }}',
        multiselect_var: '${{ parameters.multiselect_var }}',
      });
    });

    it('should handle survey with empty spec', () => {
      const mockSurvey: ISurvey = {
        name: 'Empty Survey',
        description: 'A survey with no questions',
        spec: [],
      };

      const [surveyForm, extraVariables] = getSurveyDetails({}, mockSurvey);

      expect(surveyForm.required).toEqual([]);
      expect(surveyForm.properties).toBeUndefined();
      expect(extraVariables).toEqual({});
    });
  });

  describe('generateTemplate', () => {
    const mockJob: IJobTemplate = {
      id: 123,
      name: 'Test Job Template',
      description: 'A comprehensive test job template',
      job_type: 'run',
      inventory: 1,
      project: 1,
      playbook: 'test.yml',
      scm_branch: '',
      forks: 5,
      limit: '',
      verbosity: 0,
      extra_vars: '{}',
      job_tags: '',
      skip_tags: '',
      timeout: 0,
      use_fact_cache: false,
      host_config_key: '',
      ask_scm_branch_on_launch: false,
      ask_diff_mode_on_launch: false,
      ask_variables_on_launch: false,
      ask_limit_on_launch: false,
      ask_tags_on_launch: false,
      ask_skip_tags_on_launch: false,
      ask_job_type_on_launch: false,
      ask_verbosity_on_launch: false,
      ask_inventory_on_launch: false,
      ask_credential_on_launch: false,
      ask_execution_environment_on_launch: false,
      survey_enabled: false,
      become_enabled: false,
      diff_mode: false,
      allow_simultaneous: false,
      job_slice_count: 1,
      webhook_service: 'github',
      webhook_credential: 1,
      prevent_instance_group_fallback: false,
      ask_labels_on_launch: false,
      ask_forks_on_launch: false,
      ask_job_slice_count_on_launch: false,
      ask_timeout_on_launch: false,
      ask_instance_groups_on_launch: false,
      organization: 1,
      last_job_run: null,
      last_job_failed: false,
      next_job_run: 'next-run-time',
      status: 'successful',
      execution_environment: 1,
      type: 'job_template',
      url: 'test-url',
      created: '2023-01-01T00:00:00Z',
      modified: '2023-01-01T00:00:00Z',
      webhook_url: '',
      webhook_key: '',
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
          total_hosts: 0,
          hosts_with_active_failures: 0,
          total_groups: 0,
          has_inventory_sources: false,
          total_inventory_sources: 0,
          inventory_sources_with_failures: 0,
          organization_id: 1,
          kind: 'inventory',
        },
        organization: {
          id: 1,
          name: 'Test Org',
          description: 'Test organization',
        },
        execution_environment: undefined,
        credentials: [],
        labels: {
          count: 2,
          results: [
            {
              id: 1,
              name: 'dev',
              organization: 1,
              type: 'label',
              url: 'test-url',
              created: '2023-01-01T00:00:00Z',
              modified: '2023-01-01T00:00:00Z',
              summary_fields: {
                created_by: {
                  username: 'test',
                  first_name: 'Test',
                  last_name: 'User',
                  id: 1,
                },
                modified_by: {
                  username: 'test',
                  first_name: 'Test',
                  last_name: 'User',
                  id: 1,
                },
                organization: {
                  id: 1,
                  name: 'Test Org',
                  description: 'Test organization',
                },
              },
            },
            {
              id: 2,
              name: 'test environment',
              organization: 1,
              type: 'label',
              url: 'test-url',
              created: '2023-01-01T00:00:00Z',
              modified: '2023-01-01T00:00:00Z',
              summary_fields: {
                created_by: {
                  username: 'test',
                  first_name: 'Test',
                  last_name: 'User',
                  id: 1,
                },
                modified_by: {
                  username: 'test',
                  first_name: 'Test',
                  last_name: 'User',
                  id: 1,
                },
                organization: {
                  id: 1,
                  name: 'Test Org',
                  description: 'Test organization',
                },
              },
            },
          ],
        },
        project: { id: 1, name: 'Test Project' },
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
        resolved_environment: {
          id: 1,
          name: 'Test Environment',
          description: 'Test environment description',
          image: 'test-image:latest',
        },
        recent_jobs: [],
        webhook_credential: {
          id: 1,
          name: 'Test Credential',
          description: 'Test credential description',
          kind: 'ssh',
          cloud: false,
        },
      },
    };

    const mockSurvey: ISurvey = {
      name: 'Test Survey',
      description: 'Survey description',
      spec: [
        {
          question_name: 'Environment',
          question_description: 'Select environment',
          variable: 'env_var',
          type: 'multiplechoice',
          required: true,
          default: 'dev',
          choices: ['dev', 'staging', 'production'],
          min: 0,
          max: 100,
          new_question: false,
        },
        {
          type: 'integer',
          default: 80,
          required: true,
          variable: 'iis_port',
          question_name: 'Server Port',
          question_description: 'Network port to listen on',
        },
      ] as ISpec[],
    };

    it('should generate template without survey', () => {
      const options = {
        baseUrl: 'https://ansible.example.com',
        nameSpace: 'default',
        job: mockJob,
        survey: null,
        instanceGroup: [],
      };

      const result = generateTemplate(options);

      expect(result.apiVersion).toBe('scaffolder.backstage.io/v1beta3');
      expect(result.kind).toBe('Template');
      expect(result.metadata.namespace).toBe('default');
      expect(result.metadata.name).toBe('test-job-template');
      expect(result.metadata.title).toBe('Test Job Template');
      expect(result.metadata.description).toBe(
        'A comprehensive test job template',
      );
      expect(result.metadata.tags).toEqual(['dev', 'test-environment']);
      expect(result.metadata.annotations).toEqual({
        [ANNOTATION_LOCATION]:
          'url:https://ansible.example.com/execution/templates/job-template/123/details',
        [ANNOTATION_ORIGIN_LOCATION]:
          'url:https://ansible.example.com/execution/templates/job-template/123/details',
      });

      expect((result.spec as any).type).toBe('service');
      expect((result.spec as any).parameters).toHaveLength(1);
      expect((result.spec as any).parameters[0].title).toBe(
        'Please enter the following details',
      );

      expect((result.spec as any).steps).toHaveLength(1);
      expect((result.spec as any).steps[0].id).toBe('launch-job');
      expect((result.spec as any).steps[0].name).toBe('Test Job Template');
      expect((result.spec as any).steps[0].action).toBe(
        'rhaap:launch-job-template',
      );
      expect((result.spec as any).steps[0].input.token).toBe(
        '${{ parameters.token }}',
      );
      expect((result.spec as any).steps[0].input.values.template).toEqual(
        'Test Job Template',
      );
      // Verify token is NOT in values object
      expect((result.spec as any).steps[0].input.values.token).toBeUndefined();

      expect((result.spec as any).output.text).toHaveLength(1);
      expect((result.spec as any).output.text[0].title).toBe(
        'Test Job Template template executed successfully',
      );
      expect((result.spec as any).output.links).not.toBeDefined();
    });

    it('should generate template with survey', () => {
      const options = {
        baseUrl: 'https://ansible.example.com',
        nameSpace: 'test-namespace',
        job: mockJob,
        survey: mockSurvey,
        instanceGroup: [],
      };

      const result = generateTemplate(options);

      expect((result.spec as any).parameters).toHaveLength(1);
      expect((result.spec as any).parameters[0].title).toBe(
        'Please enter the following details',
      );
      expect(
        (result.spec as any).parameters[0].properties.env_var,
      ).toBeDefined();

      expect(
        (result.spec as any).steps[0].input.values.extraVariables.env_var,
      ).toBe('${{ parameters.env_var }}');
    });

    it('should generate template with job that has ask_on_launch flags', () => {
      const jobWithFlags = {
        ...mockJob,
        ask_inventory_on_launch: true,
        ask_forks_on_launch: true,
      };

      const options = {
        baseUrl: 'https://ansible.example.com',
        nameSpace: 'default',
        job: jobWithFlags,
        survey: null,
        instanceGroup: [],
      };

      const result = generateTemplate(options);

      expect(
        (result.spec as any).parameters[0].properties.inventory,
      ).toBeDefined();
      expect((result.spec as any).parameters[0].properties.forks).toBeDefined();
      expect((result.spec as any).steps[0].input.values.inventory).toBe(
        '${{ parameters.inventory }}',
      );
      expect((result.spec as any).steps[0].input.values.forks).toBe(
        '${{ parameters.forks }}',
      );
    });

    it('should handle job with no labels or empty labels', () => {
      const jobWithoutLabels = {
        ...mockJob,
        summary_fields: {
          ...mockJob.summary_fields,
          labels: { count: 0, results: [] },
        },
      };

      const options = {
        baseUrl: 'https://ansible.example.com',
        nameSpace: 'default',
        job: jobWithoutLabels,
        survey: null,
        instanceGroup: [],
      };

      const result = generateTemplate(options);

      expect(result.metadata.tags).toEqual([]);
    });

    it('should format tag names correctly by replacing special characters', () => {
      const jobWithSpecialLabels = {
        ...mockJob,
        summary_fields: {
          ...mockJob.summary_fields,
          labels: {
            count: 4,
            results: [
              {
                id: 1,
                name: 'test environment',
                organization: 1,
                type: 'label',
                url: 'test-url',
                created: '2023-01-01T00:00:00Z',
                modified: '2023-01-01T00:00:00Z',
                summary_fields: {
                  created_by: {
                    username: 'test',
                    first_name: 'Test',
                    last_name: 'User',
                    id: 1,
                  },
                  modified_by: {
                    username: 'test',
                    first_name: 'Test',
                    last_name: 'User',
                    id: 1,
                  },
                  organization: {
                    id: 1,
                    name: 'Test Org',
                    description: 'Test organization',
                  },
                },
              },
              {
                id: 2,
                name: 'production,server',
                organization: 1,
                type: 'label',
                url: 'test-url',
                created: '2023-01-01T00:00:00Z',
                modified: '2023-01-01T00:00:00Z',
                summary_fields: {
                  created_by: {
                    username: 'test',
                    first_name: 'Test',
                    last_name: 'User',
                    id: 1,
                  },
                  modified_by: {
                    username: 'test',
                    first_name: 'Test',
                    last_name: 'User',
                    id: 1,
                  },
                  organization: {
                    id: 1,
                    name: 'Test Org',
                    description: 'Test organization',
                  },
                },
              },
              {
                id: 3,
                name: 'dev_env',
                organization: 1,
                type: 'label',
                url: 'test-url',
                created: '2023-01-01T00:00:00Z',
                modified: '2023-01-01T00:00:00Z',
                summary_fields: {
                  created_by: {
                    username: 'test',
                    first_name: 'Test',
                    last_name: 'User',
                    id: 1,
                  },
                  modified_by: {
                    username: 'test',
                    first_name: 'Test',
                    last_name: 'User',
                    id: 1,
                  },
                  organization: {
                    id: 1,
                    name: 'Test Org',
                    description: 'Test organization',
                  },
                },
              },
              {
                id: 4,
                name: 'staging.server',
                organization: 1,
                type: 'label',
                url: 'test-url',
                created: '2023-01-01T00:00:00Z',
                modified: '2023-01-01T00:00:00Z',
                summary_fields: {
                  created_by: {
                    username: 'test',
                    first_name: 'Test',
                    last_name: 'User',
                    id: 1,
                  },
                  modified_by: {
                    username: 'test',
                    first_name: 'Test',
                    last_name: 'User',
                    id: 1,
                  },
                  organization: {
                    id: 1,
                    name: 'Test Org',
                    description: 'Test organization',
                  },
                },
              },
            ],
          },
        },
      };

      const options = {
        baseUrl: 'https://ansible.example.com',
        nameSpace: 'default',
        job: jobWithSpecialLabels,
        survey: null,
        instanceGroup: [],
      };

      const result = generateTemplate(options);

      expect(result.metadata.tags).toEqual([
        'test-environment',
        'production-server',
        'dev-env',
        'staging-server',
      ]);
    });
  });
});
