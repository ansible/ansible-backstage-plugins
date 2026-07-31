# US-002 — Git Repos chrome (chips + Run quality scan)

| Field | Value |
|-------|--------|
| **Status** | Complete |
| **Persona** | Developer |
| **Surface** | Self-service Git Repositories table / header (extension points) |
| **Depends on** | [US-001](US-001-quality-tab-scan-with-ai.md) (Quality tab workflow) |

## Story

> As a developer, I want to see quality status on the Git Repositories list and
> start a scan from there, so I can triage repos without opening each catalog
> entity’s Quality tab first.

## Acceptance criteria

- [x] Git Repos table shows a **Violations** column (count + worst severity).
      Status chips removed for list parity with prototype (noisy).
- [x] List **Actions** kebab includes **Run quality scan** (via
      `getCatalogRowMenuItems`) — opens Quality with `CheckOptionsForm`.
- [x] Detail header **Actions → Run quality scan** opens the Quality tab with
      `CheckOptionsForm` (core version / AI / etc.) — user starts Scan there.
- [x] Implemented as **thin host extensions** on eap-next — no in-repo MUI
      remediation steppers; scan UI remains `@apme/ui-workflow`.
- [x] Wired via self-service / Git Repos extension factories (ADR-010);
      `dynamic-plugins.override.yaml` + janus updated for RHDH Local.
- [x] Verified in local loop (`make react` and/or `make sync` + RHDH).

## Out of scope

- Portal-side SCM commit (`RemediationPublisher`) — Gateway owns SCM (ADR-056).
- Fleet Quality page tab ([US-005](US-005-fleet-quality.md)).
- Remove / Dev Spaces menu items ([US-011](US-011-quick-actions-dev-spaces.md)).

## Notes

- Craig journey: [J1](user-journeys.md) (catalog violations column); overview
  card → [US-006](US-006-overview-quality-card.md); Dev Spaces / remaining
  header actions → [US-011](US-011-quick-actions-dev-spaces.md).
- Host contract: `@ansible/backstage-rhaap-common/gitRepositoriesExtensions`.
- Guest factory: `gitRepositoriesExtensionsApiFactory` (thin surfaces only).
- RHDH Local must register **only** the APME factory — also registering
  `defaultGitRepositoriesExtensionsApiFactory` for the same `apiRef` blanks
  the SPA.
- List chrome: Violations column only (no “Fix violations →” CTA; no status
  chips). Run scan stays on list/detail Actions kebab.
