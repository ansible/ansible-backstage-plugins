import { LoggerService } from '@backstage/backend-plugin-api';
import {
  HttpAuthService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import express from 'express';
import {
  createProxyMiddleware,
  type Options as ProxyOptions,
} from 'http-proxy-middleware';

/** Options for {@link createRouter}. */
export interface RouterOptions {
  logger: LoggerService;
  gatewayBaseUrl: string;
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
}

/**
 * Creates an Express router that proxies all traffic to the APME Gateway.
 *
 * Supports REST, SSE (chunked transfer), and WebSocket upgrades.
 * Injects an `X-Backstage-User` header with the authenticated user's entity
 * ref so the Gateway can attribute requests.
 */
export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, gatewayBaseUrl } = options;
  const router = express.Router();

  // Health endpoint (unauthenticated) — checks Gateway reachability.
  router.get('/health', async (_req, res) => {
    try {
      const upstream = await fetch(`${gatewayBaseUrl}/api/v1/health`);
      const body = await upstream.json();
      res.status(upstream.status).json(body);
    } catch (err) {
      logger.error(`APME Gateway health check failed: ${err}`);
      res.status(502).json({ status: 'error', detail: 'Gateway unreachable' });
    }
  });

  // Proxy configuration for all /api/v1/* paths.
  const proxyOptions: ProxyOptions = {
    target: gatewayBaseUrl,
    changeOrigin: true,
    ws: true,
    pathRewrite: { '^/': '/api/v1/' },
    on: {
      proxyReq: (proxyReq, req) => {
        // Forward Backstage user identity to the Gateway.
        const userRef = (req as any).__backstageUserRef;
        if (userRef) {
          proxyReq.setHeader('X-Backstage-User', userRef);
        }
      },
      error: (err, _req, _res) => {
        logger.error(`APME proxy error: ${err.message}`);
      },
    },
    // Required for SSE: do not buffer the response.
    selfHandleResponse: false,
  };

  const proxy = createProxyMiddleware(proxyOptions);

  // Middleware to resolve Backstage user identity and attach to request
  // before the proxy sends it upstream.  Auth is best-effort so SSE and
  // other streaming endpoints still work when cookies aren't forwarded.
  router.use('/api/v1', async (req, _res, next) => {
    try {
      const credentials = await options.httpAuth.credentials(req as any, {
        allow: ['user', 'service'],
        allowLimitedAccess: true,
      });
      const info = await options.userInfo.getUserInfo(credentials);
      (req as any).__backstageUserRef = info.userEntityRef;
    } catch {
      // If unauthenticated or user info unavailable, proceed without header.
    }
    next();
  });

  router.use('/api/v1', proxy);

  return router;
}
