import type express from 'express';
import type { RouterDependencies } from './types';
import type { SaveProfileRequest } from '@ansible/backstage-compliance-common';
import { requirePermission } from './permissions';
import { isNonEmptyString, isPositiveInteger } from './validation';

export function registerProfileRoutes(
  router: express.Router,
  deps: RouterDependencies,
): void {
  const { logger, database, httpAuth, permissions } = deps;

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

  router.post('/compliance-profiles', async (req, res) => {
    if (!(await requirePermission(req, res, httpAuth, permissions))) return;

    const body = req.body;

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
      const profile = await database.saveProfile(saveRequest);
      res.status(201).json(profile);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to save compliance profile: ${msg}`);
      res.status(500).json({ error: 'Failed to save compliance profile' });
    }
  });

  router.delete('/compliance-profiles/:id', async (req, res) => {
    if (!(await requirePermission(req, res, httpAuth, permissions))) return;

    const { id } = req.params;
    try {
      const deleted = await database.deleteProfile(id);
      if (!deleted) {
        res.status(404).json({ error: 'Compliance profile not found' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to delete compliance profile: ${msg}`);
      res.status(500).json({ error: 'Failed to delete compliance profile' });
    }
  });

  // ─── Profile lifecycle ────────────────────────────────────────────

  router.post('/compliance-profiles/connect', async (req, res) => {
    if (!(await requirePermission(req, res, httpAuth, permissions))) return;

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
    if (!(await requirePermission(req, res, httpAuth, permissions))) return;

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

  // ─── Custom tab bundle ────────────────────────────────────────────

  const MAX_BUNDLE_SIZE = 5 * 1024 * 1024; // 5 MB

  router.put('/compliance-profiles/:id/bundle', async (req, res) => {
    if (!(await requirePermission(req, res, httpAuth, permissions))) return;

    const { id } = req.params;
    const profile = await database.getProfile(id);
    if (!profile) {
      res.status(404).json({ error: 'Compliance profile not found' });
      return;
    }

    try {
      const contentType = req.headers['content-type'] ?? '';
      const allowedTypes = [
        'application/javascript',
        'text/javascript',
        'application/json',
      ];
      if (!allowedTypes.some(t => contentType.includes(t))) {
        res.status(415).json({
          error: `Unsupported content type: ${contentType}. Use application/javascript or application/json.`,
        });
        return;
      }

      const bundleData =
        typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const size = Buffer.byteLength(bundleData, 'utf8');

      if (size > MAX_BUNDLE_SIZE) {
        res.status(413).json({
          error: `Bundle exceeds maximum size of ${
            MAX_BUNDLE_SIZE / 1024 / 1024
          }MB`,
        });
        return;
      }

      const metadata = {
        size,
        uploadedAt: new Date().toISOString(),
      };
      await database.saveProfileBundle(id, bundleData, metadata);
      res.status(201).json(metadata);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to upload bundle for profile ${id}: ${msg}`);
      res.status(500).json({ error: 'Failed to upload bundle' });
    }
  });

  router.get('/compliance-profiles/:id/bundle', async (req, res) => {
    const { id } = req.params;
    try {
      const bundle = await database.getProfileBundle(id);
      if (!bundle) {
        res.status(404).json({ error: 'No bundle found for this profile' });
        return;
      }
      res.set('Content-Type', 'application/javascript');
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(bundle.data);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get bundle for profile ${id}: ${msg}`);
      res.status(500).json({ error: 'Failed to retrieve bundle' });
    }
  });

  router.delete('/compliance-profiles/:id/bundle', async (req, res) => {
    if (!(await requirePermission(req, res, httpAuth, permissions))) return;

    const { id } = req.params;
    try {
      const deleted = await database.deleteProfileBundle(id);
      if (!deleted) {
        res.status(404).json({ error: 'Profile or bundle not found' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to delete bundle for profile ${id}: ${msg}`);
      res.status(500).json({ error: 'Failed to delete bundle' });
    }
  });
}
