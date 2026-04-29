import { Request, Response, NextFunction } from 'express';
import { LoggerService } from '@backstage/backend-plugin-api';
import {
  PlatformTask,
  TaskExecution,
  CertificateReport,
} from '@ansible/backstage-rhaap-common';
import { IAAPService } from '@ansible/backstage-rhaap-common';
import {
  parseCertificateOutput,
  computeCertificateSummary,
} from './certificateParser';

export interface PlatformOpsContext {
  logger: LoggerService;
  aapClient: IAAPService;
}

/**
 * Default platform tasks available in the system.
 */
export function getDefaultTasks(): PlatformTask[] {
  return [
    {
      id: 'cert-check',
      name: 'AAP Certificate Check',
      description:
        'Discovers and reports on SSL/TLS certificates across AAP infrastructure',
      templateId: undefined, // Configured via app-config.yaml
      parserType: 'certificate',
      enabled: true,
      defaultExtraVars: {
        high_water_mark: 10,     // Warning threshold
        critical_water_mark: 5,  // Critical threshold
      },
      createdAt: new Date().toISOString(),
      createdBy: 'system',
    },
  ];
}

/**
 * Executes a platform task and returns the execution result.
 */
export async function executeTask(
  context: PlatformOpsContext,
  task: PlatformTask,
  token: string,
  extraVars?: Record<string, unknown>,
): Promise<TaskExecution> {
  const { logger, aapClient } = context;
  const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  if (!task.templateId) {
    throw new Error(`Task "${task.name}" has no associated job template ID`);
  }

  // Merge default extra vars with provided ones (provided takes precedence)
  const mergedExtraVars = {
    ...task.defaultExtraVars,
    ...extraVars,
  };

  logger.info(
    `[platformOps] Executing task "${task.name}" (template ID: ${task.templateId})`,
  );

  const startTime = new Date().toISOString();

  try {
    // Launch the job template with merged extra vars
    const launchResult = await aapClient.launchJobTemplateById(
      task.templateId,
      token,
      Object.keys(mergedExtraVars).length > 0 ? mergedExtraVars : undefined,
    );

    logger.info(
      `[platformOps] Job launched: ${launchResult.jobId}, polling for completion...`,
    );

    // Poll for job completion
    const jobResult = await aapClient.fetchResult(launchResult.jobId, token);

    const endTime = new Date().toISOString();
    const jobStatus = jobResult.jobData?.status || 'unknown';

    // Get stdout for parsing
    const stdout = await aapClient.getJobStdout(launchResult.jobId, token);

    // Parse output based on parser type
    let parsedOutput: unknown = stdout;
    if (task.parserType === 'certificate') {
      const parsed = parseCertificateOutput(stdout);
      // Use summary from playbook if available, otherwise compute it
      const summary = parsed.summary || computeCertificateSummary(parsed.certificates);
      parsedOutput = {
        certificates: parsed.certificates,
        summary,
        host: parsed.host,
        checkDate: parsed.checkDate,
        thresholds: parsed.thresholds,
        parseErrors: parsed.parseErrors,
        rawStdout: stdout, // Include raw output for debugging
      } as CertificateReport;
    }

    const execution: TaskExecution = {
      id: executionId,
      taskId: task.id,
      status: jobStatus === 'successful' ? 'completed' : 'failed',
      startedAt: startTime,
      completedAt: endTime,
      jobId: launchResult.jobId,
      output: parsedOutput,
      error:
        jobStatus !== 'successful'
          ? `Job finished with status: ${jobStatus}`
          : undefined,
    };

    logger.info(
      `[platformOps] Task "${task.name}" completed with status: ${execution.status}`,
    );

    return execution;
  } catch (error) {
    const endTime = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(`[platformOps] Task "${task.name}" failed: ${errorMessage}`);

    return {
      id: executionId,
      taskId: task.id,
      status: 'failed',
      startedAt: startTime,
      completedAt: endTime,
      error: errorMessage,
    };
  }
}

/**
 * Gets the status of a running or completed job.
 */
export async function getTaskExecutionStatus(
  context: PlatformOpsContext,
  jobId: number,
  token: string,
): Promise<{ status: string; started: string; finished: string }> {
  const { aapClient } = context;
  return aapClient.getJobStatus(jobId, token);
}

/**
 * Middleware factory for platform ops permission checking.
 * For now, we require the user to be authenticated.
 * Future: add specific platform ops permissions.
 */
export function createPlatformOpsAuthMiddleware(options: {
  logger: LoggerService;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // For now, just check that Authorization header is present
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      options.logger.warn('[platformOps] Missing or invalid Authorization header');
      res.status(401).json({ error: 'Unauthorized: missing bearer token' });
      return;
    }
    next();
  };
}

/**
 * Extracts the AAP token from the X-AAP-Token header or Authorization header.
 */
export function extractBearerToken(req: Request): string | undefined {
  // First try X-AAP-Token header (preferred for platform ops)
  const aapToken = req.headers['x-aap-token'];
  if (aapToken && typeof aapToken === 'string') {
    return aapToken;
  }

  // Fall back to Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return undefined;
}
