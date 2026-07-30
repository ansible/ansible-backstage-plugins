# US-001 — Quality tab scan with AI toggle

| Field | Value |
|-------|--------|
| **Status** | Complete |
| **Persona** | Developer |
| **Surface** | Catalog entity → **Quality** tab (`ApmeEntityTab` + `@apme/ui-workflow`) |
| **Verified** | RHDH Local loop (`make sync` / `make up` / `make react`) against Gateway `:8080` |

## Story

> As a developer, I want to run a scan from the Quality tab for a given catalog
> item, with the ability to enable or disable AI, so I can assess and remediate
> Ansible content without leaving the catalog.

## Acceptance criteria

- [x] Open a catalog Component with SCM annotations → **Quality** tab loads.
- [x] Idle chrome shows overview + check options (including **AI enable/disable**).
- [x] Starting Scan attaches a live session and drives the full workflow UI.
- [x] With AI **on**, AI model / escalation paths are available when the Gateway
      supports them.
- [x] With AI **off**, the scan/remediation path still completes without requiring
      AI steps.
- [x] Workflow stages below are reachable from the Quality tab (not a separate
      SPA-only path).

## Workflow steps (all stages)

Shared `@apme/ui-workflow` session mounted from the Quality tab:

| Step | What the user sees / does |
|------|---------------------------|
| 1. Options | `CheckOptionsForm`: Ansible version, collections, **AI on/off** (+ model when enabled), auto-apply Tier-1 |
| 2. Scan | Start Scan → Gateway `check` operation; live progress via SSE |
| 3. Assess | Review findings (`assess_pause`) |
| 4. Choose fixes | Proposal review; Tier-1 quick-fix; optional **AI escalation** when AI is enabled |
| 5. Apply | Begin remediate / apply approved proposals |
| 6. Commit | Submit → Gateway SCM (push/PR) when configured |
| 7. Complete | Terminal operation status |

## How to verify (local)

1. Gateway up (`cd ~/github/apme && tox -e up`).
2. RHDH loop (`~/github/apme-rhdh-dev`): `make sync && make up` (or `make react` → `:3001`).
3. Guest login → Catalog → seed **terrible-playbook** (or **ansible-lightspeed**).
4. Open **Quality** tab (RHDH path ends in `/apme`).
5. Toggle AI, run Scan, walk assess → proposals → remediate as needed.

Direct RHDH URL:

`http://localhost:7007/catalog/default/component/terrible-playbook-github-manual/apme`

## Notes

- AI gate: `ansible.apme.enableAi` (default **on** in local configs), ANDed into
  check options; per-scan toggle still available on the Quality tab.
- Host wiring: `plugins/backstage-apme` thin host; UI package `@apme/ui-workflow`.
- See [`plugins/backstage-apme/ARCHITECTURE.md`](../../plugins/backstage-apme/ARCHITECTURE.md) for adapter and proxy details.
