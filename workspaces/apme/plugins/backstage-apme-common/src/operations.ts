import { createPermission } from '@backstage/plugin-permission-common';

/** Shared entitlement declaration; frontend and backend use the same contract. */
export const apmeScanningPermission = createPermission({
  name: 'ansible.apme.scanning',
  attributes: { action: 'read' },
});

export const apmeScanningEntitlement = {
  id: 'apme.scanning',
  displayName: 'APME Quality Scanning',
  description:
    'Enables content quality scanning, violation tracking, and AI-assisted rule suggestions.',
  scope: 'organization' as const,
  permissionName: apmeScanningPermission.name,
};

export const apmeRepositoryRegisterPermission = createPermission({
  name: 'ansible.apme.repository.register',
  attributes: { action: 'create' },
});

export interface RegisterRepositoryInput {
  sourceControlProvider: 'github' | 'gitlab';
  repositoryOwner: string;
  repositoryName: string;
  repositoryUrl: string;
  defaultBranch: string;
  description?: string;
  token?: string;
}

export const apmeRepositoryRegisterOperation = {
  organizationScope: 'shared' as const,
  id: 'apme.repository.register',
  version: '1.0.0',
  permission: apmeRepositoryRegisterPermission,
  inputSchema: {
    type: 'object',
    required: [
      'sourceControlProvider',
      'repositoryOwner',
      'repositoryName',
      'repositoryUrl',
      'defaultBranch',
    ],
    additionalProperties: false,
    properties: {
      sourceControlProvider: { type: 'string', enum: ['github', 'gitlab'] },
      repositoryOwner: { type: 'string', minLength: 1 },
      repositoryName: { type: 'string', minLength: 1 },
      repositoryUrl: { type: 'string', minLength: 1 },
      defaultBranch: { type: 'string', minLength: 1 },
      description: { type: 'string' },
      token: { type: 'string' },
    },
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['entityRef', 'entityName'],
    properties: {
      entityRef: { type: 'string' },
      entityName: { type: 'string' },
    },
  },
  exposure: { rest: true },
  auditCategory: 'repository-lifecycle',
  idempotent: false,
};
export const apmeRepositoryDeregisterPermission = createPermission({
  name: 'ansible.apme.repository.deregister',
  attributes: { action: 'delete' },
});
export const apmeRepositoryDeregisterOperation = {
  organizationScope: 'shared' as const,
  id: 'apme.repository.deregister',
  version: '1.0.0',
  permission: apmeRepositoryDeregisterPermission,
  inputSchema: { type: 'object', additionalProperties: false },
  exposure: { rest: true },
  auditCategory: 'repository-lifecycle',
  idempotent: true,
};

/** Mutation permission: viewing a repository never implies permission to scan. */
export const apmeQualityScanPermission = createPermission({
  name: 'ansible.apme.quality.scan',
  attributes: { action: 'create' },
});

export const apmeQualityScanOperation = {
  organizationScope: 'shared' as const,
  requiredEntitlements: [apmeScanningEntitlement.id],
  id: 'apme.quality.scan',
  version: '1.0.0',
  permission: apmeQualityScanPermission,
  inputSchema: { type: 'object', additionalProperties: false },
  exposure: { rest: true },
  auditCategory: 'quality-scan',
  idempotent: false,
};
