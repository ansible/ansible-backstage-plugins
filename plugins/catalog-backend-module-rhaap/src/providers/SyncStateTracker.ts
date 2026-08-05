import {
  LoggerService,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import { isError } from '@backstage/errors';
import type { SignalsService } from '@backstage/plugin-signals-node';

export const SYNC_SIGNAL_CHANNEL = 'catalog:aap-sync-status';

export type SyncStatus = 'success' | 'failure' | null;

export class SyncStateTracker {
  private lastSyncTime: string | null = null;
  private lastFailedSyncTime: string | null = null;
  private lastSyncStatus: SyncStatus = null;
  private isSyncing = false;
  private taskId: string | undefined;
  private signals?: SignalsService;
  private providerName?: string;

  setSignals(signals: SignalsService, providerName: string): void {
    this.signals = signals;
    this.providerName = providerName;
  }

  private publishSyncSignal(syncInProgress: boolean): void {
    this.signals
      ?.publish({
        recipients: { type: 'broadcast' },
        channel: SYNC_SIGNAL_CHANNEL,
        message: {
          provider: this.providerName ?? 'unknown',
          syncInProgress,
          lastSyncTime: this.lastSyncTime,
          lastSyncStatus: this.lastSyncStatus,
          lastFailedSyncTime: this.lastFailedSyncTime,
        },
      })
      .catch(() => {});
  }

  getLastSyncTime(): string | null {
    return this.lastSyncTime;
  }

  getLastFailedSyncTime(): string | null {
    return this.lastFailedSyncTime;
  }

  getLastSyncStatus(): SyncStatus {
    return this.lastSyncStatus;
  }

  getIsSyncing(): boolean {
    return this.isSyncing;
  }

  getTaskId(): string | undefined {
    return this.taskId;
  }

  markSyncStarted(): void {
    this.isSyncing = true;
    this.publishSyncSignal(true);
  }

  markSyncSucceeded(): void {
    this.lastSyncTime = new Date().toISOString();
    this.lastSyncStatus = 'success';
    this.isSyncing = false;
    this.publishSyncSignal(false);
  }

  markSyncFailed(): void {
    this.lastFailedSyncTime = new Date().toISOString();
    this.lastSyncStatus = 'failure';
    this.isSyncing = false;
    this.publishSyncSignal(false);
  }

  createScheduleFn(
    taskRunner: SchedulerServiceTaskRunner,
    providerName: string,
    runFn: (signal?: AbortSignal) => Promise<unknown>,
    logger: LoggerService,
    errorContext: string,
  ): () => Promise<void> {
    return async () => {
      const taskId = `${providerName}:run`;
      try {
        await taskRunner.run({
          id: taskId,
          fn: async (signal?: AbortSignal) => {
            try {
              await runFn(signal);
            } catch (error) {
              if (isError(error)) {
                logger.error(
                  `Error while syncing resources from ${errorContext}`,
                  {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                    status: (error.response as { status?: string })?.status,
                  },
                );
              }
              throw error;
            }
          },
        });
        this.taskId = taskId;
      } catch (error) {
        this.taskId = undefined;
        throw error;
      }
    };
  }
}
