/*
 * Copyright Red Hat
 *
 * Resolve inference-only AI status/models for the catalog proxy.
 * Config-listed models are reported separately and must not imply Connected.
 */

import type { LoggerService } from '@backstage/backend-plugin-api';
import {
  IApmeService,
  normalizeApmeAiProviders,
} from '@ansible/backstage-apme-common';

export type ApmeAiModelRow = {
  id: string;
  provider: string;
  name: string;
};

export type ResolvedApmeAiStatus = {
  connected: boolean;
  modelCount: number;
  configuredModelCount: number;
};

/** Live inference models only — never synthesize from Abbenay admin config. */
export async function listApmeInferenceModels(
  apmeService: IApmeService,
): Promise<ApmeAiModelRow[]> {
  return apmeService.getAiModels();
}

/**
 * connected = Abbenay control plane reachable (inference models, engines catalog,
 * or successful admin config read). modelCount is inference-only.
 * configuredModelCount is admin-config models (may be > 0 while modelCount is 0
 * when provider keys are missing from the Abbenay process env).
 */
export async function resolveApmeAiStatus(
  apmeService: IApmeService,
  logger: LoggerService,
): Promise<ResolvedApmeAiStatus> {
  let modelCount = 0;
  let connected = false;

  try {
    const models = await apmeService.getAiModels();
    modelCount = models.length;
    connected = modelCount > 0;
  } catch (err) {
    logger.debug(`APME AI models check failed: ${String(err)}`);
  }

  let configuredModelCount = 0;
  try {
    const config = await apmeService.getAiConfig();
    const providers = normalizeApmeAiProviders(config);
    configuredModelCount = providers.reduce(
      (sum, p) => sum + p.models.length,
      0,
    );
    // Admin HTTP reachable — treat as connected even if ListAIModels is empty.
    if (!connected) {
      connected = true;
    }
  } catch (err) {
    logger.debug(`APME AI config check failed: ${String(err)}`);
  }

  if (!connected) {
    try {
      const engines = await apmeService.getAiEngines();
      if ((engines?.engines ?? []).length > 0) {
        connected = true;
      }
    } catch (err) {
      logger.debug(`APME AI engines check failed: ${String(err)}`);
    }
  }

  if (!connected) {
    try {
      const health = await apmeService.getHealth();
      const abbenay = health.components?.find(c =>
        /abbenay/i.test(c.name ?? ''),
      );
      connected =
        abbenay?.status === 'ok' ||
        abbenay?.status === 'healthy' ||
        abbenay?.status === 'up';
    } catch (err) {
      logger.debug(`APME health check for AI status failed: ${String(err)}`);
    }
  }

  return { connected, modelCount, configuredModelCount };
}
