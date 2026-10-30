import { createRouteRef, createSubRouteRef } from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({
  id: 'compliance',
});

export const profileRouteRef = createSubRouteRef({
  id: 'compliance/profile',
  parent: rootRouteRef,
  path: '/profiles/:profileId',
});

export const scanRouteRef = createSubRouteRef({
  id: 'compliance/scan',
  parent: rootRouteRef,
  path: '/scan',
});

export const resultsRouteRef = createSubRouteRef({
  id: 'compliance/results',
  parent: rootRouteRef,
  path: '/results/:jobId',
});

export const remediationRouteRef = createSubRouteRef({
  id: 'compliance/remediation',
  parent: rootRouteRef,
  path: '/remediation/:jobId',
});
