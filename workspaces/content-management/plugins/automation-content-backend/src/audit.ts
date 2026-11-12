import { createHash, randomUUID } from 'node:crypto';
import type { AuditorService } from '@backstage/backend-plugin-api';

import type { TagChange } from './ContentStore';

type RefreshAction =
  | 'inventory-refresh'
  | 'registry-refresh'
  | 'registry-poll'
  | 'repository-refresh'
  | 'scheduled-refresh'
  | 'scheduled-poll'
  | 'refresh-denied';

interface RefreshAuditContext {
  action: RefreshAction;
  principal: string;
  resource: string;
}

/** Starts a refresh audit with resolved identity and already redacted resource. */
export async function startRefreshAudit(
  auditor: AuditorService,
  { action, principal, resource }: RefreshAuditContext,
): ReturnType<AuditorService['createEvent']> {
  return auditor.createEvent({
    eventId: action,
    severityLevel: 'medium',
    meta: {
      initiatingPrincipal: principal,
      resource,
      correlationId: randomUUID(),
      at: new Date().toISOString(),
    },
  });
}

/** Stable identifiers avoid copying registry-controlled names into audit storage. */
export function auditResource(...parts: string[]): string {
  return createHash('sha256')
    .update(JSON.stringify(parts), 'utf8')
    .digest('hex');
}

export function auditTagChanges(changes: readonly TagChange[]): Array<{
  tag: string;
  before: string | null;
  after: string | null;
}> {
  return changes.map(({ repository, tag, before, after }) => ({
    tag: auditResource(repository, tag),
    before: before === undefined ? null : auditResource(before),
    after: after === undefined ? null : auditResource(after),
  }));
}
