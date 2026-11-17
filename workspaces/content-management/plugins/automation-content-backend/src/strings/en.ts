export const messages = {
  authorizationUnavailable: 'Authorization is temporarily unavailable.',
  forbidden: 'Access denied.',
  manualSyncDisabled: 'Manual refresh is disabled on this deployment.',
  auditUnavailable: 'Refresh auditing is temporarily unavailable.',
  auditUnconfirmed:
    'Refresh was applied, but its audit record could not be confirmed. Reload before trying again.',
  auditFailed: 'Refresh failed.',
  refreshBusy: 'A refresh is already running.',
  registryNotFound: 'Registry not found.',
  repositoryNotFound: 'Repository not found.',
  invalidRepository: 'Invalid repository selection.',
  invalidRepositoryQuery: 'Invalid repository query',
  repositoryQueryTooLarge: 'Repository query is too large',
  scanIncomplete:
    'The registry scan was incomplete. Previous data was retained.',
  scheduleAuditUnconfirmed:
    'Refresh was scheduled, but its audit record could not be confirmed.',
  schedulingFailed: 'Unable to schedule the refresh.',
} as const;
