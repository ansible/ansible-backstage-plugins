import express from 'express';
import type { RouterDependencies } from './types';
import { isValidScanId } from './validation';
import { resolveScanId } from './helpers';
import type { HttpAuthService } from '@backstage/backend-plugin-api';

async function requireUserAuth(
  httpAuth: HttpAuthService | undefined,
  req: express.Request,
  res: express.Response,
): Promise<boolean> {
  if (!httpAuth) return true;
  try {
    await httpAuth.credentials(req);
    return true;
  } catch {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }
}

const ARTIFACT_KEY_RE = /^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,254}$/;

function isValidArtifactKey(key: string): boolean {
  return ARTIFACT_KEY_RE.test(key) && !key.includes('..');
}

export function registerArtifactRoutes(
  router: express.Router,
  deps: RouterDependencies,
): void {
  const { logger, database, httpAuth } = deps;

  router.post('/scans/:scanId/artifacts', express.json({ limit: '1kb' }), async (req, res) => {
    const { scanId } = req.params;
    if (!isValidScanId(scanId)) {
      res.status(400).json({ error: 'Invalid scanId' });
      return;
    }

    const { artifactKey, ociReference, artifactName, mimeType, ingestToken } = req.body;
    if (!artifactKey || !ociReference || !artifactName) {
      res.status(400).json({ error: 'Missing required fields: artifactKey, ociReference, artifactName' });
      return;
    }

    if (!isValidArtifactKey(artifactKey)) {
      res.status(400).json({ error: 'Invalid artifactKey format' });
      return;
    }

    const scan = await database.getScanById(scanId);
    if (!scan) {
      res.status(404).json({ error: `Scan ${scanId} not found` });
      return;
    }

    const storedToken = await database.getIngestToken(scanId);
    if (storedToken) {
      if (!ingestToken || storedToken !== ingestToken) {
        res.status(403).json({ error: 'Invalid or missing ingest token' });
        return;
      }
    }

    await database.storeArtifact(
      scanId,
      artifactKey,
      ociReference,
      artifactName,
      mimeType || 'application/json',
    );

    logger.info(`Artifact registered: ${artifactKey} for scan ${scanId}`);
    res.status(201).json({ artifactKey, scanId });
  });

  router.get('/scans/:scanId/artifacts', async (req, res) => {
    if (!await requireUserAuth(httpAuth, req, res)) return;
    const { scanId } = req.params;
    if (!isValidScanId(scanId)) {
      res.status(400).json({ error: 'Invalid scanId' });
      return;
    }

    const { resolvedScanId } = await resolveScanId(database, scanId);
    const artifacts = await database.getArtifactsForScan(resolvedScanId || scanId);
    res.json(artifacts);
  });

  router.get('/scans/:scanId/artifacts/:key/download', async (req, res) => {
    if (!await requireUserAuth(httpAuth, req, res)) return;
    const { scanId, key } = req.params;
    if (!isValidScanId(scanId)) {
      res.status(400).json({ error: 'Invalid scanId' });
      return;
    }
    if (!isValidArtifactKey(key)) {
      res.status(400).json({ error: 'Invalid artifact key format' });
      return;
    }

    const { resolvedScanId: resolvedId } = await resolveScanId(database, scanId);
    const artifact = await database.getArtifact(resolvedId || scanId, key);
    if (!artifact) {
      res.status(404).json({ error: `Artifact ${key} not found for scan ${scanId}` });
      return;
    }

    try {
      const blob = await fetchOciBlob(artifact.ociReference, logger);
      const safeName = artifact.artifactName.replace(/["\r\n]/g, '_');
      res.set('Content-Type', artifact.mimeType);
      res.set('Content-Disposition', `attachment; filename="${safeName}"`);
      res.set('X-Content-Type-Options', 'nosniff');
      res.send(Buffer.from(blob));
    } catch (err: any) {
      logger.error(`Failed to fetch artifact from PAH: ${err.message}`);
      res.status(502).json({ error: 'Failed to fetch artifact from registry' });
    }
  });
}

async function getRegistryToken(
  registry: string,
  repository: string,
  dispatcher: any,
  logger: any,
): Promise<string | null> {
  const challengeResp = await fetch(`https://${registry}/v2/`, { dispatcher } as any);
  if (challengeResp.ok) return null;

  const wwwAuth = challengeResp.headers.get('www-authenticate') || '';
  const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
  const serviceMatch = wwwAuth.match(/service="([^"]+)"/);
  if (!realmMatch) return null;

  const realm = realmMatch[1];
  const service = serviceMatch?.[1] || registry;
  const scope = `repository:${repository}:pull`;

  const aapUser = process.env.AAP_REGISTRY_USER || 'admin';
  const aapPass = process.env.AAP_REGISTRY_PASSWORD || '';
  const basicAuth = aapPass ? `Basic ${Buffer.from(`${aapUser}:${aapPass}`).toString('base64')}` : undefined;

  const tokenUrl = `${realm}?service=${encodeURIComponent(service)}&scope=${encodeURIComponent(scope)}`;
  logger.info(`Requesting registry token from ${realm}`);

  const tokenResp = await fetch(tokenUrl, {
    headers: basicAuth ? { Authorization: basicAuth } : {},
    dispatcher,
  } as any);

  if (!tokenResp.ok) {
    logger.warn(`Registry token request failed: ${tokenResp.status}`);
    return null;
  }

  const body = await tokenResp.json() as any;
  return body.token || body.access_token || null;
}

async function fetchOciBlob(
  ociReference: string,
  logger: any,
): Promise<ArrayBuffer> {
  const match = ociReference.match(/^([^/]+)\/(.+):(.+)$/);
  if (!match) throw new Error(`Invalid OCI reference: ${ociReference}`);

  const [, registry, repository, tag] = match;

  const { Agent } = await import('undici');
  const dispatcher = new Agent({ connect: { rejectUnauthorized: false } });

  const token = await getRegistryToken(registry, repository, dispatcher, logger);
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const baseUrl = `https://${registry}`;
  const manifestUrl = `${baseUrl}/v2/${repository}/manifests/${tag}`;
  logger.info(`Fetching OCI manifest: ${manifestUrl}`);

  const manifestResp = await fetch(manifestUrl, {
    headers: {
      Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.oras.artifact.manifest.v1+json',
      ...authHeaders,
    },
    dispatcher,
  } as any);

  if (!manifestResp.ok) {
    throw new Error(`Manifest fetch failed: ${manifestResp.status} ${manifestResp.statusText}`);
  }

  const manifest = await manifestResp.json() as any;
  const layers = manifest.layers || manifest.blobs || [];
  if (layers.length === 0) {
    throw new Error('No layers in OCI manifest');
  }

  const layer = layers[0];
  const blobUrl = `${baseUrl}/v2/${repository}/blobs/${layer.digest}`;
  logger.info(`Fetching OCI blob: ${blobUrl}`);

  const blobResp = await fetch(blobUrl, {
    headers: authHeaders,
    dispatcher,
  } as any);
  if (!blobResp.ok) {
    throw new Error(`Blob fetch failed: ${blobResp.status} ${blobResp.statusText}`);
  }

  return blobResp.arrayBuffer();
}
