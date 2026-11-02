import type express from 'express';
import type { RouterDependencies } from './types';
import type { SaveProfileRequest } from '@ansible/compliance-common';
import {
  profileManagePermission,
  complianceProfileSaveOperation,
  complianceProfileDeleteOperation,
} from '@ansible/compliance-common';
import { resolvePortalContext } from '@ansible/portal-plugin-node';
import { requirePermission } from './permissions';
import { isNonEmptyString, isPositiveInteger } from './validation';
import {
  COMPLIANCE_OPERATION_SUBJECT,
  handleProfileDelete,
  handleProfileSave,
  sendOperationError,
} from '../operations';

export function registerProfileRoutes(
  router: express.Router,
  deps: RouterDependencies,
): void {
  const {
    logger,
    database,
    httpAuth,
    permissions,
    operations,
    userInfo,
    organizations,
  } = deps;

  router.get('/compliance-profiles', async (req, res) => {
    const includeDisconnected = req.query.includeDisconnected === 'true';
    const profiles = await database.listProfiles(includeDisconnected);
    res.json(profiles);
  });

  router.get('/compliance-profiles/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const profile = await database.getProfile(id);
      if (!profile) {
        res.status(404).json({ error: 'Compliance profile not found' });
        return;
      }
      res.json(profile);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get compliance profile: ${msg}`);
      res.status(500).json({ error: 'Failed to retrieve compliance profile' });
    }
  });

  // Legacy transport adapters (Content Experience Architecture §9.2): the
  // actual save/delete business logic lives in `handleProfileSave()` /
  // `handleProfileDelete()` (`compliance-backend/src/operations.ts`),
  // registered with the host's `PortalOperations` as
  // `compliance.profile.save` / `compliance.profile.delete`. These routes
  // only translate between Express and those operations — see
  // `routes/scans.ts`'s `POST /scan` for the identical production/
  // development branching they mirror.
  router.post('/compliance-profiles', async (req, res) => {
    const body = req.body;

    if (operations && httpAuth && permissions && userInfo && organizations) {
      try {
        // Express Request (express-promise-router) vs Backstage's `credentials` param use incompatible Express generics; runtime value is valid.
        // @ts-expect-error Avoid double assertion flagged by Sonar; types do not overlap per TS.
        const credentials = await httpAuth.credentials(req, {
          allow: ['user'],
        });
        const context = await resolvePortalContext({
          credentials,
          userInfo,
          organizations,
        });
        const profile = await operations.execute(
          complianceProfileSaveOperation.id,
          {
            subject: { entityRef: COMPLIANCE_OPERATION_SUBJECT },
            input: body as Record<string, unknown>,
          },
          { ...context, credentials },
          permissions,
        );
        res.status(201).json(profile);
      } catch (error) {
        sendOperationError(res, error, {
          status: 500,
          body: { error: 'Failed to save compliance profile' },
        });
      }
      return;
    }

    if (!isNonEmptyString(body.displayName)) {
      res.status(400).json({
        error: 'displayName is required and must be a non-empty string',
      });
      return;
    }
    if (!isNonEmptyString(body.framework)) {
      res.status(400).json({
        error: 'framework is required and must be a non-empty string',
      });
      return;
    }
    if (
      body.workflowTemplateId !== undefined &&
      body.workflowTemplateId !== null &&
      !isPositiveInteger(body.workflowTemplateId)
    ) {
      res.status(400).json({
        error: 'workflowTemplateId must be a positive integer when provided',
      });
      return;
    }
    if (body.platformSpec !== undefined && body.platformSpec !== null) {
      if (
        typeof body.platformSpec !== 'object' ||
        Array.isArray(body.platformSpec)
      ) {
        res
          .status(400)
          .json({ error: 'platformSpec must be an object when provided' });
        return;
      }
    }

    const saveRequest: SaveProfileRequest = {
      id: body.id,
      profileSlug: body.profileSlug?.trim() || undefined, // ignored on update — slug is immutable after creation (ADR-036)
      displayName: body.displayName.trim(),
      description: body.description ?? '',
      framework: body.framework,
      version: body.version ?? '',
      platform: body.platform ?? '',
      platformSpec: body.platformSpec ?? null,
      workflowTemplateId: body.workflowTemplateId ?? null,
      remediateJtId: body.remediateJtId ?? null,
      eeId: body.eeId ?? null,
      remediationPlaybookPath: body.remediationPlaybookPath ?? '',
      scanTags: body.scanTags ?? '',
      certification: body.certification ?? null,
      displayConfig: body.displayConfig ?? undefined,
    };

    try {
      const profile = await handleProfileSave(saveRequest, {
        database,
        logger,
      });
      res.status(201).json(profile);
    } catch (error) {
      sendOperationError(res, error, {
        status: 500,
        body: { error: 'Failed to save compliance profile' },
      });
    }
  });

  router.delete('/compliance-profiles/:id', async (req, res) => {
    const { id } = req.params;

    if (operations && httpAuth && permissions && userInfo && organizations) {
      try {
        // Express Request (express-promise-router) vs Backstage's `credentials` param use incompatible Express generics; runtime value is valid.
        // @ts-expect-error Avoid double assertion flagged by Sonar; types do not overlap per TS.
        const credentials = await httpAuth.credentials(req, {
          allow: ['user'],
        });
        const context = await resolvePortalContext({
          credentials,
          userInfo,
          organizations,
        });
        await operations.execute(
          complianceProfileDeleteOperation.id,
          {
            subject: { entityRef: COMPLIANCE_OPERATION_SUBJECT },
            input: { id },
          },
          { ...context, credentials },
          permissions,
        );
        res.status(204).send();
      } catch (error) {
        sendOperationError(res, error, {
          status: 500,
          body: { error: 'Failed to delete compliance profile' },
        });
      }
      return;
    }

    try {
      await handleProfileDelete({ id }, { database, logger });
      res.status(204).send();
    } catch (error) {
      sendOperationError(res, error, {
        status: 500,
        body: { error: 'Failed to delete compliance profile' },
      });
    }
  });

  // ─── Profile lifecycle ────────────────────────────────────────────

  router.post('/compliance-profiles/connect', async (req, res) => {
    if (
      !(await requirePermission(
        req,
        res,
        httpAuth,
        permissions,
        profileManagePermission,
      ))
    )
      return;

    const { framework, version, displayName, slug } = req.body;
    if (!isNonEmptyString(framework)) {
      res.status(400).json({ error: 'framework is required' });
      return;
    }
    try {
      const profile = await database.connectProfile(
        framework,
        version ?? '',
        displayName,
        slug,
      );
      if (!profile) {
        res.status(404).json({
          error: `No profile with framework '${framework}' found to reconnect`,
        });
        return;
      }
      res.json(profile);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to connect profile: ${msg}`);
      res.status(500).json({ error: 'Failed to connect profile' });
    }
  });

  router.post('/compliance-profiles/disconnect', async (req, res) => {
    if (
      !(await requirePermission(
        req,
        res,
        httpAuth,
        permissions,
        profileManagePermission,
      ))
    )
      return;

    const { profileId, framework, slug } = req.body;
    try {
      let success = false;
      if (isNonEmptyString(profileId)) {
        success = await database.disconnectProfile(profileId);
      } else if (isNonEmptyString(slug)) {
        success = await database.disconnectProfileBySlug(slug);
      } else if (isNonEmptyString(framework)) {
        logger.warn(
          'disconnect-by-framework is deprecated — use profileId or slug',
        );
        success = await database.disconnectProfileByFramework(framework);
      } else {
        res
          .status(400)
          .json({ error: 'profileId, slug, or framework is required' });
        return;
      }
      if (!success) {
        res.status(404).json({ error: 'Profile not found' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to disconnect profile: ${msg}`);
      res.status(500).json({ error: 'Failed to disconnect profile' });
    }
  });

  // ─── Custom tab bundle: retired (ADR-040) ──────────────────────────
  //
  // `PUT/GET/DELETE /compliance-profiles/:id/bundle` (ADR-027 Tier 2)
  // are removed. No frontend code ever loaded a bundle via dynamic
  // `import()` — this plugin's capabilities are now declared once, in
  // `complianceManifest.ts`, and validated by the host at registration
  // time, rather than fetched per-profile from the backend at runtime.
  // See ADR-040 for the full rationale and the compliance workspace's
  // ADR-027 for the retired design.
}
