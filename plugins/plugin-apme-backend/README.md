# @ansible/plugin-apme-backend

Backend plugin that proxies requests from the Backstage frontend to the
**APME Gateway** REST API. Supports HTTP, SSE (Server-Sent Events), and
WebSocket connections for the full APME experience (scanning, remediation,
playground, notifications).

## Configuration

Add to your `app-config.yaml`:

```yaml
apme:
  gateway:
    baseUrl: http://apme-gateway:8080
```

## Registration

```ts
// packages/backend/src/index.ts
backend.add(import('@ansible/plugin-apme-backend'));
```

## How it works

All requests to `/api/apme/api/v1/*` are proxied to the APME Gateway. The
plugin resolves the authenticated Backstage user and forwards the identity
in an `X-Backstage-User` header for attribution and future authorization.
