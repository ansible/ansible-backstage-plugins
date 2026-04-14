import {
  getVerbosityObject,
  IJobTemplate,
  ILabel,
  ISpec,
  ISurvey,
  InstanceGroup,
} from '@ansible/backstage-rhaap-common';
import {
  ANNOTATION_LOCATION,
  ANNOTATION_ORIGIN_LOCATION,
  Entity,
} from '@backstage/catalog-model';
import { JsonArray, JsonObject } from '@backstage/types';
import { formatNameSpace } from '../helpers';
import { normalizeBaseUrl } from './helpers';

function scaffolderParametersRef(key: string): string {
  return `\${{ parameters[${JSON.stringify(key)}] }}`;
}

function scaffolderSecretsRef(key: string): string {
  return `\${{ secrets[${JSON.stringify(key)}] }}`;
}

function normalizeMultiselectSurveyDefault(
  defaultValue: unknown,
): string[] | null {
  if (
    defaultValue === undefined ||
    defaultValue === null ||
    defaultValue === ''
  ) {
    return null;
  }
  if (Array.isArray(defaultValue)) {
    const arr = defaultValue
      .map(v => (v === null || v === undefined ? '' : String(v)).trim())
      .filter(s => s.length > 0);
    return arr.length > 0 ? arr : null;
  }
  if (typeof defaultValue === 'string') {
    const arr = defaultValue
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    return arr.length > 0 ? arr : null;
  }
  return null;
}

const SURVEY_ITEM_JSON_TYPE: Partial<
  Record<ISpec['type'], 'string' | 'array' | 'integer' | 'number'>
> = {
  text: 'string',
  textarea: 'string',
  multiplechoice: 'string',
  password: 'string',
  multiselect: 'array',
  integer: 'integer',
  float: 'number',
};

function resolveSurveyJsonType(item: ISpec): string | null {
  return SURVEY_ITEM_JSON_TYPE[item.type] ?? null;
}

function getNumericBoundsForSurveyItem(item: ISpec): {
  minimum?: number;
  maximum?: number;
} {
  if (item.type !== 'integer' && item.type !== 'float') {
    return {};
  }
  const bounds: { minimum?: number; maximum?: number } = {};
  if (typeof item.min === 'number') {
    bounds.minimum = item.min;
  }
  if (typeof item.max === 'number') {
    bounds.maximum = item.max;
  }
  return bounds;
}

function shouldEmitSurveyDefault(
  item: ISpec,
  multiselectDefault: string[] | null,
): boolean {
  if (item.type === 'password') {
    return false;
  }
  if (item.default === undefined || item.default === null) {
    return false;
  }
  if (
    (item.type === 'integer' || item.type === 'float') &&
    item.default === ''
  ) {
    return false;
  }
  if (item.type === 'multiselect' && multiselectDefault === null) {
    return false;
  }
  return true;
}

function normalizeSurveyChoices(choices: string | string[]): string[] {
  if (Array.isArray(choices)) {
    return choices;
  }
  if (typeof choices !== 'string') {
    return [];
  }
  const trimmed = choices.trim();
  if (trimmed === '') {
    return [];
  }
  return trimmed
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function getSurveyFieldExtensions(item: ISpec): JsonObject {
  const ex: JsonObject = {};
  if (item.type === 'textarea') {
    ex['ui:widget'] = 'textarea';
    ex['ui:placeholder'] = `${item.question_description}...`;
    ex['ui:options'] = {
      rows: 5,
    };
  }
  if (item.type === 'password') {
    ex['ui:placeholder'] = `${item.question_description}...`;
    ex['ui:field'] = 'Secret';
    ex['ui:backstage'] = {
      review: {
        show: false,
      },
    };
  }
  if (item.type === 'multiplechoice') {
    ex.enum = normalizeSurveyChoices(item.choices);
  }
  if (item.type === 'multiselect') {
    ex.items = {
      type: 'string',
      enum: normalizeSurveyChoices(item.choices),
    };
    ex['ui:widget'] = 'select';
    ex.uniqueItems = true;
  }
  return ex;
}

function buildSurveySpecProperty(item: ISpec): JsonObject {
  const inputType = resolveSurveyJsonType(item);
  const numericBounds = getNumericBoundsForSurveyItem(item);
  const multiselectDefault =
    item.type === 'multiselect'
      ? normalizeMultiselectSurveyDefault(item.default)
      : null;
  const includeDefault = shouldEmitSurveyDefault(item, multiselectDefault);

  const prop: JsonObject = {
    title: item.question_name,
    description: item.question_description,
  };
  if (inputType) {
    prop.type = inputType;
  }
  Object.assign(prop, numericBounds);
  Object.assign(prop, getSurveyFieldExtensions(item));
  if (includeDefault) {
    prop.default = multiselectDefault ?? item.default;
  }
  return prop;
}

export const getPromptForm = () => {
  return {
    title: 'Please enter the following details',
    required: [] as string[],
    properties: {},
  };
};

export const getJobTypeProps = (jobType: string) => {
  return {
    title: 'Job type',
    description: 'The type of job to launch',
    type: 'string',
    enum: ['run', 'check'],
    default: jobType,
  };
};

export const getInventoryProps = (inventory: JsonObject) => {
  return {
    title: 'Inventory',
    description: 'Please enter the inventory you want to use the services on',
    resource: 'inventories',
    'ui:field': 'AAPResourcePicker',
    default: inventory,
  };
};

export const getEEProps = (
  selectedEE: { id: number; name: string } | undefined,
  orgId: number | undefined,
) => {
  return {
    title: 'Execution environment',
    'ui:field': 'AAPResourcePicker',
    resource: `execution_environments:${orgId}`,
    ...(selectedEE && { default: selectedEE }),
  };
};

export const getCredentialsProps = (selectedCredentials: JsonArray) => {
  const normalizedCredentials = (selectedCredentials || [])
    .filter(
      (cred): cred is JsonObject => cred !== null && typeof cred === 'object',
    )
    .map((cred: JsonObject) => {
      const summaryFields = cred.summary_fields;
      const summaryFieldsObj =
        summaryFields &&
        typeof summaryFields === 'object' &&
        !Array.isArray(summaryFields)
          ? summaryFields
          : {};

      const normalizedObj: JsonObject = {
        id: cred.id,
        name: cred.name,
        type: cred.type || 'credential',
        credential_type: cred.credential_type,
        summary_fields: {
          ...summaryFieldsObj,
          credential_type:
            summaryFieldsObj.credential_type &&
            typeof summaryFieldsObj.credential_type === 'object' &&
            !Array.isArray(summaryFieldsObj.credential_type)
              ? summaryFieldsObj.credential_type
              : {
                  id: cred.credential_type,
                  name: (cred.kind as string) || 'Unknown',
                },
        },
      };
      return normalizedObj;
    });

  return {
    title: 'Credentials',
    description:
      'Select credentials for accessing the nodes this job will be run against. You can only select one credential of each type.',
    type: 'array',
    'ui:field': 'AAPResourcePicker',
    resource: 'credentials',
    default: normalizedCredentials,
  };
};

export const getLabelsProps = (labels: JsonObject[]) => {
  return {
    title: 'Labels',
    description:
      'Optional labels that describe this job template, such as "dev" or "test". Labels can be used to group and filter job templates and completed jobs.',
    type: 'array',
    'ui:field': 'AAPResourcePicker',
    resource: 'labels',
    default: labels,
  };
};

export const getForksProps = (forks: number) => {
  return {
    title: 'Forks',
    description: `The number of parallel or simultaneous processes to use while executing the playbook.
    An empty value, or a value less than 1 will use the Ansible default which is usually 5.
    The default number of forks can be overwritten with a change to ansible.cfg.
    Refer to the Ansible documentation for details about the configuration file.`,
    type: 'number',
    default: forks,
  };
};

export const getLimitProps = (limit: string) => {
  return {
    title: 'Limit',
    description: `Provide a host pattern to further constrain the list of hosts that will be managed or affected by the playbook.
    Multiple patterns are allowed. Refer to Ansible documentation for more information and examples on patterns.`,
    type: 'string',
    default: limit,
  };
};

export const getVerbosityProps = (verbosity: JsonObject) => {
  return {
    title: 'Verbosity',
    description:
      'Control the level of output Ansible will produce as the playbook executes.',
    'ui:field': 'AAPResourcePicker',
    resource: 'verbosity',
    default: verbosity,
  };
};

export const getJobSliceCountProps = (jobSliceCount: number) => {
  return {
    title: 'Job slicing',
    description: `Divide the work done by this job template into the specified number of job slices,
    each running the same tasks against a portion of the inventory.`,
    type: 'number',
    default: jobSliceCount,
  };
};

export const getTimeoutProps = (timeout: number) => {
  return {
    title: 'Timeout',
    description:
      'The amount of time (in seconds) to run before the job is canceled. Defaults to 0 for no job timeout.',
    type: 'number',
    default: timeout,
  };
};

export const getDiffModeProps = (diffMode: boolean) => {
  return {
    title: 'Show changes',
    description: `If enabled, show the changes made by Ansible tasks, where supported.
    This is equivalent to Ansible's --diff mode.`,
    type: 'boolean',
    default: diffMode,
  };
};

export const getInstanceGroupsProps = (instanceGroups: InstanceGroup[]) => {
  return {
    title: 'Instance groups',
    description: 'Select the instance groups for this job template to run on.',
    type: 'array',
    'ui:field': 'AAPResourcePicker',
    resource: 'instance_groups',
    default: instanceGroups.map(ig => ig.id.toString()),
  };
};

export const getSCMBranchProps = (scmBranch: string) => {
  return {
    title: 'SCM Branch',
    description:
      'Branch to use in job run. Project default used if blank. Only allowed if project allow_override field is set to true.',
    placeholder: 'Enter source control branch',
    type: 'string',
    default: scmBranch,
  };
};

export const getTagsProps = (tags: string[]) => {
  return {
    title: 'Tags',
    description: 'Tags to use in job run.',
    type: 'array',
    'ui:field': 'AAPResourcePicker',
    resource: 'tags',
    default: tags,
  };
};

export const getSkipTagsProps = (skipTags: string[]) => {
  return {
    title: 'Skip Tags',
    description: 'Tags to skip in job run.',
    type: 'array',
    'ui:field': 'AAPResourcePicker',
    resource: 'skip_tags',
    default: skipTags,
  };
};

export const getPromptFormDetails = (
  job: IJobTemplate,
  instanceGroup: InstanceGroup[],
) => {
  const promptForm = getPromptForm();
  const properties: JsonObject = {};

  if (job.ask_job_type_on_launch) {
    properties.job_type = getJobTypeProps(job.job_type);
    promptForm.required = [...promptForm.required, 'job_type'];
  }

  if (job.ask_inventory_on_launch) {
    properties.inventory = getInventoryProps(job.summary_fields.inventory);
    promptForm.required = [...promptForm.required, 'inventory'];
  }

  if (job.ask_execution_environment_on_launch) {
    properties.execution_environment = getEEProps(
      job.summary_fields.execution_environment,
      job.summary_fields.organization?.id,
    );
  }

  if (job.ask_scm_branch_on_launch) {
    properties.scm_branch = getSCMBranchProps(job.scm_branch);
  }

  if (job.ask_credential_on_launch) {
    properties.credentials = getCredentialsProps(
      job.summary_fields.credentials as JsonArray,
    );
  }

  if (job.ask_labels_on_launch) {
    properties.labels = getLabelsProps(
      job.summary_fields.labels.results as any,
    );
  }

  if (job.ask_instance_groups_on_launch) {
    properties.instance_groups = getInstanceGroupsProps(instanceGroup);
  }

  if (job.ask_tags_on_launch) {
    properties.tags = getTagsProps(job.job_tags.split(',') ?? []);
  }

  if (job.ask_skip_tags_on_launch) {
    properties.skip_tags = getSkipTagsProps(job.skip_tags.split(',') ?? []);
  }

  if (job.ask_forks_on_launch) {
    properties.forks = getForksProps(job.forks);
  }

  if (job.ask_limit_on_launch) {
    properties.limit = getLimitProps(job.limit);
  }

  if (job.ask_verbosity_on_launch) {
    properties.verbosity = getVerbosityProps(getVerbosityObject(job.verbosity));
  }

  if (job.ask_job_slice_count_on_launch) {
    properties.job_slice_count = getJobSliceCountProps(job.job_slice_count);
  }

  if (job.ask_timeout_on_launch) {
    properties.timeout = getTimeoutProps(job.timeout);
  }

  if (job.ask_diff_mode_on_launch) {
    properties.diff_mode = getDiffModeProps(job.diff_mode);
  }

  const inputVars: JsonObject = {};
  for (const e of Object.keys(properties)) {
    inputVars[e] = scaffolderParametersRef(e);
  }

  promptForm.properties = { ...promptForm.properties, ...properties };

  return [promptForm, inputVars];
};

export const getSurveyDetails = (
  promptForm: JsonObject,
  survey: ISurvey | null,
) => {
  const extraVariables: any = {};
  if (!survey) {
    return [promptForm, extraVariables];
  }
  for (const item of survey.spec ?? []) {
    if (!promptForm.properties) {
      promptForm.properties = {} as JsonObject;
    }
    const paramVar = item.variable;
    (promptForm.properties as JsonObject)[paramVar] =
      buildSurveySpecProperty(item);
    extraVariables[paramVar] =
      item.type === 'password'
        ? scaffolderSecretsRef(paramVar)
        : scaffolderParametersRef(paramVar);
  }

  promptForm.required = [
    ...((promptForm.required as string[]) || []),
    ...(survey.spec || [])
      .filter(specItem => specItem.required)
      .map(specItem => specItem.variable),
  ];

  return [promptForm, extraVariables];
};

export const generateTemplate = (options: {
  baseUrl: string;
  nameSpace: string;
  job: IJobTemplate;
  survey: ISurvey | null;
  instanceGroup: InstanceGroup[];
}): Entity => {
  const { baseUrl, nameSpace, job, survey, instanceGroup } = options;
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const [promptForm, inputVars] = getPromptFormDetails(job, instanceGroup);
  const [finalPromptForm, extraVariables] = getSurveyDetails(
    promptForm,
    survey,
  );
  const template: Entity = {
    apiVersion: 'scaffolder.backstage.io/v1beta3',
    kind: 'Template',
    metadata: {
      namespace: nameSpace,
      name: formatNameSpace(job.name),
      title: job.name,
      aapJobTemplateId: job.id,
      description: job.description,
      tags: (job.summary_fields.labels?.results ?? []).map((label: ILabel) =>
        label.name
          .toLowerCase()
          .replace(/[^a-z0-9+#-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^(-|-$)/g, ''),
      ),
      annotations: {
        [ANNOTATION_LOCATION]: `url:${normalizedBaseUrl}/execution/templates/job-template/${job.id}/details`,
        [ANNOTATION_ORIGIN_LOCATION]: `url:${normalizedBaseUrl}/execution/templates/job-template/${job.id}/details`,
      },
    },
    spec: {
      type: 'service',
      parameters: [finalPromptForm],
      steps: [
        {
          id: 'launch-job',
          name: job.name,
          action: 'rhaap:launch-job-template',
          input: {
            token: '${{ secrets.aapToken }}',
            values: {
              template: job.name,
              ...Object.fromEntries(
                Object.entries(inputVars).filter(([key]) => key !== 'token'),
              ),
              ...(survey && { extraVariables }),
            },
          },
        },
      ],
      output: {
        text: [
          {
            title: `${job.name} template executed successfully`,
            content:
              // eslint-disable-next-line no-multi-str
              " \
              **Job ID:** ${{steps['launch-job'].output.data.id }} \
              **Job STATUS:** ${{ steps['launch-job'].output.data.status }} \
            ",
          },
        ],
      },
    },
  };

  return template;
};
