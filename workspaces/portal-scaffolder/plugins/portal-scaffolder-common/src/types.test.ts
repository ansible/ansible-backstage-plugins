import type {
  AnsibleApi,
  EEBuildApi,
  EEBuildRegistryType,
  EEBuildRequest,
  EEBuildResult,
  EEBuildTriggerOptions,
  UserJobTemplate,
} from './types';

const userJobTemplate: UserJobTemplate = {
  id: 42,
  name: 'Deploy application',
};

const registryType: EEBuildRegistryType = 'custom';

const buildRequest: EEBuildRequest = {
  entityRef: 'component:default/application',
  registryType,
  customRegistryUrl: 'registry.example.com',
  imageName: 'application',
  imageTag: 'latest',
  verifyTls: true,
};

const buildResult: EEBuildResult = {
  accepted: true,
  workflowId: 'workflow-42',
  workflowUrl: 'https://ci.example.com/workflows/42',
  pipelineId: 'pipeline-42',
  pipelineUrl: 'https://ci.example.com/pipelines/42',
  message: 'Build accepted',
};

const buildTriggerOptions: EEBuildTriggerOptions = {
  scmToken: 'token',
  scmProvider: 'github',
};

const ansibleApi: AnsibleApi = {
  syncTemplates: async () => true,
  syncOrgsUsersTeam: async () => true,
  getUserJobTemplates: async () => ({ items: [userJobTemplate] }),
  getSyncStatus: async () => ({
    aap: {
      orgsUsersTeams: { lastSync: null, syncInProgress: false },
      jobTemplates: { lastSync: null, syncInProgress: false },
    },
  }),
};

const eeBuildApi: EEBuildApi = {
  triggerBuild: async (request, options) => {
    expect(request).toBe(buildRequest);
    expect(options).toBe(buildTriggerOptions);
    return buildResult;
  },
};

describe('portal-scaffolder common contracts', () => {
  it('exposes the shared API and wire types', async () => {
    expect(await ansibleApi.getUserJobTemplates()).toEqual({
      items: [userJobTemplate],
    });
    expect(
      await eeBuildApi.triggerBuild(buildRequest, buildTriggerOptions),
    ).toEqual(buildResult);
  });
});
