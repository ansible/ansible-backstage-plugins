import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { AAPApiClient } from './helpers';
import { AnsibleConfig, Project } from '../types';

export const createProjectAction = (ansibleConfig: AnsibleConfig) => {
  return createTemplateAction<{
    token: string;
    deleteIfExist: boolean;
    values: Project;
  }>({
    id: 'rhaap:create-project',
    schema: {
      input: {
        type: 'object',
        required: ['token', 'values'],
        properties: {
          token: {
            type: 'string',
          },
          deleteIfExist: {
            type: 'boolean',
            description: 'Delete project if exist',
          },
          values: {
            type: 'object',
            required: ['projectName', 'organization', 'scmUrl'],
            properties: {
              projectName: {
                title: 'Name',
                type: 'string',
              },
              projectDescription: {
                title: 'Description',
                type: 'string',
              },
              organization: {
                title: 'Organization',
                type: 'object',
                description: 'Organization ID',
                required: ['id'],
                properties: {
                  id: {
                    type: 'number',
                    description: 'Organization id',
                  },
                  name: {
                    type: 'string',
                    description: 'Organization name',
                  },
                },
              },
              scmUrl: {
                title: 'Source control URL',
                type: 'string',
                description: 'Source control URL',
              },
              scmBranch: {
                title: 'Source control branch/tag/commit',
                type: 'string',
                description: 'Source control branch/tag/commit',
              },
              scmUpdateOnLaunch: {
                title: 'Update revision on launch',
                type: 'boolean',
                description:
                  'Each time a job runs using this project, update the revision of the project prior to starting the job.',
              },
            },
          },
        },
      },
      output: {
        type: 'object',
        properties: {
          project: {
            type: 'object',
            properties: {
              id: {
                title: 'Project id',
                type: 'number',
              },
              name: {
                title: 'Project name',
                type: 'string',
              },
              description: {
                title: 'Project description',
                type: 'string',
              },
              url: {
                title: 'Project url',
                type: 'string',
              },
            },
          },
        },
      },
    },
    async handler(ctx) {
      const { input, logger } = ctx;
      const token = input.token;
      if (!token?.length) {
        const error = new Error('Authorization token not provided.');
        error.stack = '';
        throw error;
      }
      const apiClient = new AAPApiClient({
        ansibleConfig,
        logger,
        token,
      });
      let projectData;
      try {
        projectData = await apiClient.createProject(
          input.values,
          input.deleteIfExist,
        );
      } catch (e: any) {
        const message = e?.message ?? 'Something went wrong.';
        const error = new Error(message);
        error.stack = '';
        throw error;
      }
      ctx.output('project', projectData);
    },
  });
};
