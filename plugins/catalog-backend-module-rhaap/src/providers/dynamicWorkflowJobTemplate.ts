import { IWorkflowJobTemplate, ISurvey } from '@ansible/backstage-rhaap-common';
import {
  ANNOTATION_LOCATION,
  ANNOTATION_ORIGIN_LOCATION,
  Entity,
} from '@backstage/catalog-model';
import { JsonObject, JsonValue } from '@backstage/types';
import { formatNameSpace } from '../helpers';
import { normalizeBaseUrl } from './helpers';
import {
  getInventoryProps,
  getLimitProps,
  getPromptForm,
  getSCMBranchProps,
  getSurveyDetails,
} from './dynamicJobTemplate';

function scaffolderParametersRef(key: string): string {
  return `\${{ parameters[${JSON.stringify(key)}] }}`;
}

function askVariablesExtraVarsProps(extraVars: string | undefined): JsonObject {
  return {
    title: 'Extra variables',
    description:
      'Extra variables for this workflow run (YAML or JSON). Used when the workflow prompts for variables on launch.',
    type: 'string',
    default: extraVars ?? '',
    'ui:widget': 'textarea',
    'ui:options': {
      rows: 8,
    },
  };
}

export const getWorkflowPromptFormDetails = (wf: IWorkflowJobTemplate) => {
  const promptForm = getPromptForm();
  const properties: JsonObject = {};

  if (wf.ask_inventory_on_launch) {
    properties.inventory = getInventoryProps(
      (wf.summary_fields?.inventory ?? {}) as JsonObject,
    );
    promptForm.required = [...promptForm.required, 'inventory'];
  }

  if (wf.ask_limit_on_launch) {
    properties.limit = getLimitProps(wf.limit ?? '');
    promptForm.required = [...promptForm.required, 'limit'];
  }

  if (wf.ask_scm_branch_on_launch) {
    properties.scm_branch = getSCMBranchProps(wf.scm_branch ?? '');
    promptForm.required = [...promptForm.required, 'scm_branch'];
  }

  if (wf.ask_variables_on_launch && !wf.survey_enabled) {
    properties.extra_vars_raw = askVariablesExtraVarsProps(wf.extra_vars);
    promptForm.required = [...promptForm.required, 'extra_vars_raw'];
  }

  const inputVars: JsonObject = {};
  for (const e of Object.keys(properties)) {
    inputVars[e] = scaffolderParametersRef(e);
  }

  promptForm.properties = { ...promptForm.properties, ...properties };

  return [promptForm, inputVars];
};

export const generateWorkflowJobTemplateEntity = (options: {
  baseUrl: string;
  nameSpace: string;
  workflow: IWorkflowJobTemplate;
  survey: ISurvey | null;
}): Entity => {
  const { baseUrl, nameSpace, workflow: wf, survey } = options;
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const [promptForm, inputVars] = getWorkflowPromptFormDetails(wf);
  const [finalPromptForm, surveyExtraVars] = getSurveyDetails(
    promptForm,
    survey,
  );

  const catalogName = `${formatNameSpace(wf.name)}-wf-${wf.id}`;

  const useSurveyExtra =
    wf.survey_enabled &&
    !!survey?.spec?.length &&
    Object.keys(surveyExtraVars).length > 0;

  const useRawExtraVars =
    wf.ask_variables_on_launch && !wf.survey_enabled && !useSurveyExtra;

  const values: JsonObject = {
    template: wf.name,
    ...Object.fromEntries(
      Object.entries(inputVars).filter(([key]) => key !== 'token'),
    ),
  } as JsonObject;

  if (useSurveyExtra) {
    values.extraVariables = surveyExtraVars as JsonValue;
  } else if (useRawExtraVars) {
    values.extraVariables = scaffolderParametersRef('extra_vars_raw');
  }

  const template: Entity = {
    apiVersion: 'scaffolder.backstage.io/v1beta3',
    kind: 'Template',
    metadata: {
      namespace: nameSpace,
      name: catalogName,
      title: wf.name,
      description: wf.description ?? '',
      tags: ['workflow', 'ansible-automation-platform'].concat(
        (wf.summary_fields.labels?.results ?? []).map(label =>
          label.name
            .toLowerCase()
            .replace(/[^a-z0-9+#-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^(-|-$)/g, ''),
        ),
      ),
      aapWorkflowJobTemplateId: wf.id,
      annotations: {
        [ANNOTATION_LOCATION]: `url:${normalizedBaseUrl}/execution/templates/workflow-job-template/${wf.id}/details`,
        [ANNOTATION_ORIGIN_LOCATION]: `url:${normalizedBaseUrl}/execution/templates/workflow-job-template/${wf.id}/details`,
        'ansible.redhat.com/template-kind': 'workflow-job-template',
      },
    },
    spec: {
      type: 'workflow-job-template',
      parameters: [finalPromptForm],
      steps: [
        {
          id: 'launch-workflow',
          name: wf.name,
          action: 'rhaap:launch-workflow-job-template',
          input: {
            token: '${{ secrets.aapToken }}',
            values,
          },
        },
      ],
      output: {
        text: [
          {
            title: `${wf.name} workflow launched`,
            content:
              // eslint-disable-next-line no-multi-str
              " \
              **Workflow job ID:** ${{ steps['launch-workflow'].output.data.id }} \
              **Status:** ${{ steps['launch-workflow'].output.data.status }} \
              **Open in AAP:** ${{ steps['launch-workflow'].output.data.url }} \
            ",
          },
        ],
      },
    },
  };

  return template;
};
