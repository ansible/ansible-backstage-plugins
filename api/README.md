# OpenAPI Specification

This directory contains the OpenAPI 3.1.0 specification for the Ansible Automation Portal backend API.

- `openapi.yaml` -- the API spec (source of truth)
- `.spectral.yaml` -- Spectral linting rules
- `scripts/check-drift.mjs` -- detects route mismatches between code and spec

## Available Scripts

```bash
yarn openapi:lint         # Lint the spec with Spectral
yarn openapi:check-drift  # Test the drift checker, then compare router files with the spec
```

## Testing APIs with Swagger UI

### 1. Start Swagger UI

Using Podman:

```bash
podman machine start  # if not already running
podman run -d --name swagger-ui -p 8080:8080 \
  -e SWAGGER_JSON=/spec/openapi.yaml \
  -v $(pwd)/api:/spec:Z \
  docker.io/swaggerapi/swagger-ui
```

Or Docker:

```bash
docker run -d --name swagger-ui -p 8080:8080 \
  -e SWAGGER_JSON=/spec/openapi.yaml \
  -v $(pwd)/api:/spec \
  swaggerapi/swagger-ui
```

Open http://localhost:8080 to browse the API documentation.

### 2. Start the Backstage application

```bash
yarn start
```

The backend will be available at http://localhost:7007.

### 3. Extract a Bearer token

Most endpoints require Backstage authentication. The automation-content liveness probe allows anonymous access. To get a valid token:

1. Open http://localhost:3000 in your browser.
2. Log in with your configured auth provider (AAP OAuth, GitHub, or GitLab).
3. Open browser DevTools (`Cmd+Option+I` on macOS, `F12` on Windows/Linux).
4. Go to the **Network** tab.
5. Navigate to any Ansible page in the UI to trigger an API call.
6. Find a request to `localhost:7007/api/catalog/...` in the network log.
7. Click on the request, then go to the **Headers** tab.
8. Copy the value of the `Authorization` header (it will look like `Bearer eyJhbG...`).

### 4. Authorize in Swagger UI

1. Go to http://localhost:8080.
2. Check the operation's server URL. The health operations use `/` and include their full `/api/<plugin>/health` paths.
3. Click the **Authorize** button (lock icon at the top right).
4. In the **Value** field, paste the Bearer token you copied (without the `Bearer ` prefix -- Swagger UI adds it automatically).
5. Click **Authorize**, then **Close**.

### 5. Execute requests

1. Expand an endpoint (e.g. `GET /api/catalog/health`).
2. Click **Try it out**.
3. Fill in any required parameters.
4. Click **Execute**.
5. The response will appear below with status code and body.

### Health endpoints

The two health operations have different authentication requirements:

| Endpoint                             | Authentication                  | Response                                   |
| ------------------------------------ | ------------------------------- | ------------------------------------------ |
| `GET /api/catalog/health`            | Backstage user or service token | `200` with credentials; `401` without them |
| `GET /api/automation-content/health` | Anonymous access allowed        | `200` without credentials                  |

Both return only `{ "status": "ok" }` on success. The automation-content probe does not contact upstream registries.

With the backend running on port 7007, these URLs are `http://localhost:7007/api/catalog/health` and `http://localhost:7007/api/automation-content/health`.

### Notes

- The Bearer token expires periodically. If you start getting `401 Unauthorized` responses, repeat step 3 to get a fresh token.
- Some endpoints require **superuser** access (marked with a lock icon). Your AAP user must have the `aap.platform/is_superuser` annotation set to `true` in the catalog.
- The `POST /ansible/ee` endpoint is restricted to **service-to-service** calls only and cannot be tested via Swagger UI.

### Stopping the application

#### Stop Swagger UI

```bash
# Podman
podman stop swagger-ui && podman rm swagger-ui

# Docker
docker stop swagger-ui && docker rm swagger-ui
```

#### Stop the Backstage application

Press `Ctrl+C` in the terminal where `yarn start` is running. If it was started in the background, run:

```bash
# Stop backend (port 7007) and frontend (port 3000)
kill $(lsof -ti:7007) 2>/dev/null
kill $(lsof -ti:3000) 2>/dev/null
```
