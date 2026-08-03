import type express from 'express';
import type { RouterDependencies } from './types';
import { getUserAapToken } from './permissions';

export function registerControllerRoutes(
  router: express.Router,
  deps: RouterDependencies,
): void {
  const { logger, service } = deps;

  router.get('/workflow-templates', async (req, res) => {
    const userToken = getUserAapToken(req);
    const nameFilter = req.query.name as string | undefined;
    const templates = await service.getWorkflowTemplates(nameFilter, userToken);
    res.json(templates);
  });

  router.get('/job-templates/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid job template ID' });
      return;
    }
    const userToken = getUserAapToken(req);
    try {
      const detail = await service.getJobTemplateDetail(id, userToken);
      res.json(detail);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to fetch JT detail for ${id}: ${msg}`);
      res.status(502).json({ error: 'Failed to fetch job template details from Controller' });
    }
  });

  router.get('/workflow-status/:jobId', async (req, res) => {
    const userToken = getUserAapToken(req);
    const jobId = Number(req.params.jobId);
    if (Number.isNaN(jobId)) {
      res.status(400).json({ error: 'jobId must be a number' });
      return;
    }
    try {
      let status;
      try {
        status = await service.getWorkflowJobStatus(jobId, userToken);
      } catch (err) {
        logger.debug(`WJT status failed for ${jobId}, falling back to JT: ${err instanceof Error ? err.message : String(err)}`);
        status = await service.getJobStatus(jobId, userToken);
      }
      res.json(status);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get workflow status for ${jobId}: ${msg}`);
      res.status(500).json({ error: 'Failed to retrieve job status' });
    }
  });

  router.get('/job-status/:jobId', async (req, res) => {
    const userToken = getUserAapToken(req);
    const jobId = Number(req.params.jobId);
    if (Number.isNaN(jobId)) {
      res.status(400).json({ error: 'jobId must be a number' });
      return;
    }
    try {
      const status = await service.getJobStatus(jobId, userToken);
      res.json(status);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get job status for ${jobId}: ${msg}`);
      res.status(500).json({ error: 'Failed to retrieve job status' });
    }
  });

  router.get('/workflow-nodes/:jobId', async (req, res) => {
    const userToken = getUserAapToken(req);
    const jobId = Number(req.params.jobId);
    if (Number.isNaN(jobId)) {
      res.status(400).json({ error: 'jobId must be a number' });
      return;
    }
    try {
      let nodes: import('@ansible/backstage-compliance-common').WorkflowNode[];
      try {
        nodes = await service.getWorkflowNodes(jobId, userToken);
      } catch (err) {
        logger.debug(`Workflow nodes failed for ${jobId} (likely a JT, not WJT): ${err instanceof Error ? err.message : String(err)}`);
        nodes = [];
      }
      res.json(nodes);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get workflow nodes for ${jobId}: ${msg}`);
      res.status(500).json({ error: 'Failed to retrieve workflow nodes' });
    }
  });

  router.get('/job-events/:jobId', async (req, res) => {
    const userToken = getUserAapToken(req);
    const jobId = Number(req.params.jobId);
    if (Number.isNaN(jobId)) {
      res.status(400).json({ error: 'jobId must be a number' });
      return;
    }
    try {
      const events = await service.getJobEvents(jobId, userToken);
      res.json(events);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get job events for ${jobId}: ${msg}`);
      res.status(500).json({ error: 'Failed to retrieve job events' });
    }
  });

  router.get('/controller/job-templates', async (req, res) => {
    const userToken = getUserAapToken(req);
    try {
      const templates = await service.getJobTemplates(undefined, userToken);
      res.json(templates);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to list job templates: ${msg}`);
      res.status(500).json({ error: 'Failed to retrieve job templates from Controller' });
    }
  });

  router.get('/controller/workflow-job-templates', async (req, res) => {
    const userToken = getUserAapToken(req);
    try {
      const templates = await service.getWorkflowTemplates(undefined, userToken);
      res.json(templates);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to list workflow job templates: ${msg}`);
      res.status(500).json({ error: 'Failed to retrieve workflow templates from Controller' });
    }
  });

  router.get('/controller/execution-environments', async (req, res) => {
    const userToken = getUserAapToken(req);
    try {
      const ees = await service.getExecutionEnvironments(userToken);
      res.json(ees);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to list execution environments: ${msg}`);
      res.status(500).json({ error: 'Failed to retrieve execution environments from Controller' });
    }
  });
}
