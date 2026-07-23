# APME Portal host — architecture overview (eap-next)

Thin Backstage host for Ansible content **Quality**: shared UI from APME, Gateway
API via the catalog proxy. Portal does **not** own remediation git push
(ADR-056) and does **not** ship a full APME SPA.

## Components

| Piece | Package / path | Role |
|-------|----------------|------|
| Shared workflow UI | `@apme/ui-workflow` (APME GitHub Release tarball, ADR-066) | Scan → pause → choose → remediate (PatternFly) |
| Thin FE host | `@ansible/plugin-backstage-apme` | Entity Quality tab; resolve/register project; mount UI |
| Catalog proxy | `@ansible/catalog-backend-module-apme` | `/api/catalog/apme/*` → APME Gateway with Backstage auth |
| Gateway | APME pod (`:8080` locally) | Operations, SSE, assess / remediate / AI |

```text
Browser (RHDH / make react)
  └─ ApmeEntityTab
       ├─ idle: Overview + CheckOptionsForm → startScan
       └─ session: ProjectWorkflowPanel (@apme/ui-workflow)
            └─ ApmeApiAdapter.fetch (Bearer via fetchApi)
                 └─ GET/POST …/api/catalog/apme/…   (absolute discovery URL)
                      └─ catalog-backend-module-apme
                           └─ APME Gateway REST + SSE
```

## Host responsibilities

- **Register / resolve** Gateway project from catalog entity SCM annotations.
- **Shell chrome**: Overview when no live session; session panel only when
  `sessionTabVisible` (avoids a permanent “Starting scan…” spinner).
- **Adapter**: absolute `apiBase` from discovery (relative `/api/...` breaks
  under `yarn start` / `make react` on `:3001`, which does not proxy `/api`).
- **AI**: Portal config `ansible.apme.enableAi`; proxy `GET /apme/ai/models`.
- **Feedback / analytics**: off for EAP unless explicitly enabled later.

## Not in this host

- Native APME SPA shell, Activity pages, Fleet Analytics
- Portal-side `RemediationPublisher` / file-bundle commit (Gateway owns SCM)
- Vendored copy of `@apme/ui-workflow` (use Release pin; bump URL on new tags)

## Related ADRs (APME)

- ADR-056 — APME owns SCM commit/push
- ADR-062 / ADR-064 / ADR-065 — assess pause, interactive gates, Gateway live state
- ADR-066 — `@apme/ui-workflow` GitHub Release tarballs
