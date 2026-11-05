import { describe, expect, it } from '@jest/globals';
import type {
  EEBuildRegistryType,
  EEBuildRequest,
  EEBuildResult,
  UserJobTemplate,
} from './types';

const registryTypes: EEBuildRegistryType[] = ['pah', 'custom'];

const buildRequest: EEBuildRequest = {
  entityRef: 'component:default/demo',
  registryType: 'pah',
  customRegistryUrl: 'https://registry.example.com',
  imageName: 'demo-ee',
  imageTag: 'latest',
  verifyTls: true,
};

const minimalBuildResult: EEBuildResult = { accepted: true };

const populatedBuildResult: EEBuildResult = {
  accepted: true,
  workflowId: 'workflow-123',
  workflowUrl: 'https://ci.example.com/workflows/123',
  pipelineId: 'pipeline-456',
  pipelineUrl: 'https://git.example.com/pipelines/456',
  message: 'Build accepted',
};

const userJobTemplate: UserJobTemplate = {
  id: 42,
  name: 'Build execution environment',
};

describe('portal-scaffolder-common wire types', () => {
  it('preserves the registry values and build request shape', () => {
    expect(registryTypes).toEqual(['pah', 'custom']);
    expect(buildRequest).toEqual({
      entityRef: 'component:default/demo',
      registryType: 'pah',
      customRegistryUrl: 'https://registry.example.com',
      imageName: 'demo-ee',
      imageTag: 'latest',
      verifyTls: true,
    });
  });

  it('allows minimal and populated build results', () => {
    expect(minimalBuildResult).toEqual({ accepted: true });
    expect(populatedBuildResult).toMatchObject({
      accepted: true,
      workflowId: 'workflow-123',
      workflowUrl: 'https://ci.example.com/workflows/123',
      pipelineId: 'pipeline-456',
      pipelineUrl: 'https://git.example.com/pipelines/456',
      message: 'Build accepted',
    });
  });

  it('preserves the user job template shape', () => {
    expect(userJobTemplate).toEqual({
      id: 42,
      name: 'Build execution environment',
    });
  });
});
