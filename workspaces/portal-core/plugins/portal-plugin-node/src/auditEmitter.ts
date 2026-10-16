import type { LoggerService } from '@backstage/backend-plugin-api';
import type { AuditEvent } from './types';

/**
 * Emits structured audit log entries for portal plugin operations.
 *
 * **Phase 5 implementation:** Audit events are written as structured log
 * entries using the Backstage `LoggerService`. Each entry includes the plugin
 * ID, operation ID, user, organization, outcome, and a UTC timestamp.
 *
 * **Future:** In a later phase the audit pipeline will persist entries to a
 * durable store, validate `operationId` against registered operation manifests,
 * and verify the calling user's permission before allowing the emit call.
 *
 * @example
 * ```ts
 * const emitter = new AuditEmitter('my-plugin', logger);
 *
 * // After a successful operation:
 * emitter.emit({
 *   operationId: 'my-plugin.scans.trigger',
 *   userId: 'johndoe',
 *   organizationId: 'acme-corp',
 *   input: { targetCollection: 'my-collection' },
 *   outcome: 'SUCCESS',
 * });
 * ```
 */
export class AuditEmitter {
  constructor(
    private readonly pluginId: string,
    private readonly logger: LoggerService,
  ) {}

  emit(event: AuditEvent): void {
    // Structured log entry. Cast to `any` because Backstage's LoggerService
    // meta type requires `JsonObject` which doesn't allow `unknown` values, but
    // logger implementations handle arbitrary serialisable objects correctly.
    this.logger.info('[portal-audit]', {
      plugin: this.pluginId,
      operationId: event.operationId,
      userId: event.userId,
      organizationId: event.organizationId,
      ...(event.organizationIds !== undefined && {
        organizationIds: event.organizationIds,
      }),
      outcome: event.outcome,
      ...(event.input !== undefined && { input: event.input }),
      ...(event.error !== undefined && { error: event.error }),
      timestamp: new Date().toISOString(),
    } as any);
  }
}
