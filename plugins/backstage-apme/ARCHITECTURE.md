# APME Portal host — architecture (eap-next)

Unify **scan → pause → choose → remediate** between the native APME SPA and
Ansible Automation Portal by sharing one PatternFly package (`@apme/ui-workflow`).
Portal is a **thin host**: entity chrome, project resolve/register, Backstage
auth, and a catalog proxy to the APME Gateway. APME owns the workflow UI,
operation state machine, and SCM commit/push.

This document is the design overview for `@ansible/plugin-backstage-apme` and
its pairing with `@ansible/catalog-backend-module-apme`. Operator loop notes
live in [apme-rhdh-dev](https://github.com/cidrblock/apme-rhdh-dev); package
publish details live in APME ADR-066.

---

## 1. Approach

### Why a thin host

Earlier Portal work re-implemented remediation UI (MUI steppers, file-bundle
review, Portal-side git). That diverged from the native SPA and fought
**ADR-056** (Gateway owns SCM). eap-next instead:

1. **Ship UI once** in APME as `@apme/ui-workflow` (PatternFly).
2. **Mount it** from the Portal Quality tab with a small adapter.
3. **Proxy** all Gateway calls through `catalog-backend-module-apme` so the
   browser never talks to `:8080` with a separate auth model.
4. **Leave analytics / fleet / SPA shell** in their native homes (Portal
   analytics stays Portal-only when re-enabled later; not part of this package).

### Ownership

| Concern | Owner |
|---------|--------|
| Scan → assess pause → proposal review → remediate → commit UI | `@apme/ui-workflow` (APME) |
| Operation state, SSE live events, assess/interactive gates | APME Gateway (ADR-062 / 064 / 065) |
| SCM commit / PR / push | APME Gateway (ADR-056) — never Portal |
| Entity Quality tab chrome, idle Overview, Scan CTA | Portal FE host |
| Resolve/register Gateway project from catalog SCM annotations | Portal FE + common helpers |
| Backstage identity → Gateway, SCM token injection | Catalog proxy |
| AI models list / enable flag (portal config + settings) | Portal config + proxy |
| Fleet Analytics, Activity SPA pages, native app shell | Native APME SPA only |
| Feedback widgets on the workflow panel | Off in Portal (`feedbackEnabled={false}`) |

### Product shape

```text
┌──────────────────── Native APME SPA ────────────────────┐
│  Shell / Activity / Analytics                            │
│  └─ workspace @apme/ui-workflow  →  /api/v1 → Gateway   │
└──────────────────────────────────────────────────────────┘

┌──────────────────── Portal (this host) ─────────────────┐
│  Catalog entity → Quality tab                            │
│  └─ tarball @apme/ui-workflow                            │
│       └─ adapter → /api/catalog/apme → proxy → Gateway   │
└──────────────────────────────────────────────────────────┘
```

Same workflow components and same Gateway operation contract; different shell
and transport.

---

## 2. Request path (wiring)

```text
Browser (RHDH or make react)
  │
  ├─ QualityTab / EntityQualityTab
  │    └─ EntityProvider → ApmeEntityTab
  │         ├─ registerOrResolveApmeProject (SCM annotations → projectId)
  │         ├─ createApmeUiWorkflowAdapter
  │         │    apiBase = discovery.getBaseUrl('catalog') + '/apme'   ← absolute
  │         │    fetch   = fetchApi.fetch                              ← Bearer
  │         └─ ApmeApiProvider
  │              └─ useProjectWorkflow
  │                   ├─ idle:  Overview + CheckOptionsForm → startScan()
  │                   └─ live:  ProjectWorkflowPanel
  │                        └─ adapter.fetch / fetch-stream SSE
  │
  ▼
Backstage backend  /api/catalog/apme/*
  └─ catalog-backend-module-apme
       ├─ ensureUser (httpAuth user credentials)
       ├─ inject scm_token (integrations / headers); strip file_overrides
       └─ forward → APME Gateway /api/v1/…
            operations, /operation/events (SSE), approve, begin-remediate,
            proposals, escalate-ai, submit, ai/models, …
```

Absolute `apiBase` is required: `yarn start` / `make react` serve the FE on
`:3001` (or `:3000`) **without** proxying `/api/*`. A relative `/api/catalog/...`
hits the SPA and returns HTML, which breaks JSON parsing and SSE.

---

## 3. Frontend host

### Entry points

| Surface | File | Role |
|---------|------|------|
| Catalog entity Quality route | `EntityQualityTab` → `ApmeEntityTab` | Real `Entity` from catalog |
| Self-service Quality page | `QualityTab` → synthetic entity → `ApmeEntityTab` | Built from `repoUrl` / `branch` |
| Plugin extensions | `plugin.ts` | `ApmeEntityTab`, `QualityTabExtension`, layout route |

### Session mount rule

`useProjectWorkflow` exposes `sessionTabVisible` (true only while an operation
is attached). **`ProjectWorkflowPanel` mounts only when `sessionTabVisible`.**

When detached, the host shows Overview + `CheckOptionsForm` + Scan. Mounting
the panel while idle leaves it stuck on “Starting scan…” (same rule as the
native SPA).

### Adapter (`createApmeUiWorkflowAdapter.ts`)

Builds the `@apme/ui-workflow` `ApmeApiAdapter`:

- `apiBase` — `await discoveryApi.getBaseUrl('catalog')` + `'/apme'`
- `fetch` — `fetchApi.fetch` (Backstage identity / Bearer)
- `origin` — derived from absolute `apiBase` so SSE URLs are absolute

SSE uses **fetch + ReadableStream** inside `@apme/ui-workflow` (not
`EventSource`), because `EventSource` cannot send Authorization headers.

### Starting a scan

Idle chrome (`ApmeEntityTab` / `WorkflowBody`):

1. User sets options on `CheckOptionsForm` (`idPrefix="portal-quality"`):
   Ansible version, collections, AI toggle, auto-apply Tier-1.
2. Scan calls `startScan()` from `useProjectWorkflow`.
3. Package opens a session and `POST …/projects/:id/operation` with
   `action: 'check'` and options including:
   - `assess_pause: true`
   - `interactive: !autoApplyTier1`
   - `enable_ai` / `ai_model` (model from `localStorage` key `apme-ai-model`)
4. On success, `sessionTabVisible` flips and `ProjectWorkflowPanel` takes over.

### AI

- Portal gate: `useApmeAiEnabled()` — prefers `GET /apme/settings` (`enableAi`),
  falls back to `ansible.apme.enableAi` in app-config.
- Models: `CheckOptionsForm` → `GET {apiBase}/ai/models` → catalog proxy.
- Effective AI flag is ANDed into check options and the panel props.

### Config knobs (portal)

```yaml
ansible:
  apme:
    enabled: true
    baseUrl: http://localhost:8080   # Gateway, used by backend module
    checkSSL: false
    publishViaGateway: true          # ADR-056 path
    enableAi: true                   # local loop; production as needed
```

---

## 4. `@apme/ui-workflow` (APME UI package)

Source: APME `frontend/packages/ui-workflow`.  
Publish: GitHub Release tarball on tag `ui-workflow-v*` (**ADR-066**), not npmjs.

### What the package is

Shared PatternFly UI for the **same** remediation workflow the native SPA uses:

| Stage (conceptual) | UI surface |
|--------------------|------------|
| Scan | Progress / live operation status via SSE |
| Review findings | Assess / findings panels (`assess_pause`) |
| Choose fixes | Proposal review; Tier-1 quick-fix; optional AI escalation |
| Apply | Begin remediate / apply proposals |
| Commit | Submit → Gateway SCM (PR/push) |
| Complete | Terminal status |

Key exports consumed by this host:

- `ApmeApiProvider`, `createDefaultApmeApiAdapter`
- `useProjectWorkflow`, `ProjectWorkflowPanel`
- `CheckOptionsForm`
- Panels: assess findings, proposal review, AI escalation, etc.
- Package CSS (`workflow.css`) imported from the package entry — required for
  inventory / finding cards to render correctly

Native SPA resolves the package via workspace / Vite alias to `src/`. Portal
installs the **packed** `dist/` tarball.

### Portal pin and dynamic export

```json
"@apme/ui-workflow": "https://github.com/ansible/apme/releases/download/ui-workflow-v0.1.1/apme-ui-workflow-0.1.1.tgz"
```

`export-dynamic` embeds the package into the RHDH dynamic plugin bundle:

```text
rhdh-cli plugin export … --embed-package @apme/ui-workflow
```

Bump process: APME tags `ui-workflow-vX.Y.Z` → update the URL in this package’s
`package.json` → `yarn install` → re-export if shipping dynamic plugins.

The host also imports PatternFly base CSS (`@patternfly/react-core/.../base.css`)
so workflow components have the design-system foundation inside Backstage.

### What is intentionally not in the package

- Backstage `Entity` / catalog APIs
- Portal analytics / feedback
- Gateway auth or SCM token handling
- Native SPA routing / Activity pages

---

## 5. Backend proxy (`catalog-backend-module-apme`)

Mounted at **`/api/catalog/apme`**. Every route requires a Backstage **user**
credential (`httpAuth.credentials(req, { allow: ['user'] })`).

### Auth and SCM

- Browser → proxy: Backstage identity (via `fetchApi`).
- Proxy → Gateway: forwards the operation; injects `scm_token` from request
  headers (`x-scm-token` / GitHub / GitLab) or Backstage integrations.
- **Never** forwards `file_overrides` on operation/submit paths (ADR-056).
  Legacy `POST /apme/projects/:id/submit` rejects file overrides; prefer
  `…/operation/submit`.

### Routes the workflow uses

| Catalog path (under `/api/catalog`) | Purpose |
|-------------------------------------|---------|
| `GET /apme/settings` | Portal settings including `enableAi` |
| `GET /apme/ai/models`, `GET /apme/ai/status` | CheckOptionsForm / AI gate |
| `GET/POST /apme/projects`, `GET /apme/lookup` | Resolve / register project |
| `ALL /apme/projects/:projectId/operation` | Create/read operation |
| `ALL /apme/projects/:projectId/operation/*` | Transparent proxy: `events`, `approve`, `begin-remediate`, `proposals`, `cancel`, `escalate-ai`, `submit`, … |

Assess and remediate are **operation actions/statuses** on that proxy surface,
not separate top-level Portal APIs. Gateway base path is `/api/v1/...`.

Other catalog routes (violations, dependencies, activity, health) support
broader APME Portal surfaces; the eap-next Quality tab path above is the
critical path for `@apme/ui-workflow`.

---

## 6. Explicit non-goals

- Re-implementing workflow UI in MUI or Portal-only components
- Portal-side git commit/push or remediation file bundles
- Vendoring `@apme/ui-workflow` as a workspace package in this monorepo
- Enabling feedback / analytics on the Quality tab for EAP
- Talking to Gateway `:8080` directly from the browser

---

## 7. Local developer loop

Primary loop: [apme-rhdh-dev](https://github.com/cidrblock/apme-rhdh-dev)

```text
Terminal A:  cd ~/github/apme && tox -e up          # Gateway :8080
Terminal B:  cd ~/github/apme-rhdh-dev && make react # FE :3001, BE :7008
Plugin src:  ~/github/ansible-backstage-plugins @ feat/apme-eap-next-ui-workflow
```

- Guest + seeded catalog entities (e.g. ansible-lightspeed, terrible-playbook)
  → entity **Quality** tab, or self-service Quality URL.
- Avoid legacy `/apme` routes in `make react` mode.
- After changing the ui-workflow pin: `yarn install` in the plugin repo, then
  restart `make react`.

---

## 8. Related APME ADRs

| ADR | Relevance |
|-----|-----------|
| ADR-056 | Gateway owns SCM; no Portal `file_overrides` submit |
| ADR-062 / 064 / 065 | Assess pause, interactive gates, live operation state |
| ADR-066 | `@apme/ui-workflow` GitHub Release tarball publish |

---

## 9. Source map (this repo)

| Path | Role |
|------|------|
| `plugins/backstage-apme/src/components/ApmeEntityTab/` | Thin host chrome + session mount |
| `plugins/backstage-apme/src/api/createApmeUiWorkflowAdapter.ts` | Discovery + fetchApi adapter |
| `plugins/backstage-apme/src/components/QualityTab/` | Self-service Quality entry |
| `plugins/backstage-apme/package.json` | Tarball pin + `--embed-package` |
| `plugins/catalog-backend-module-apme/src/router.ts` | `/apme/*` routes |
| `plugins/catalog-backend-module-apme/src/gatewayOperationProxy.ts` | Operation proxy + ADR-056 strip |
