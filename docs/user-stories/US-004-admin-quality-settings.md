# US-004 — Admin / Quality settings

| Field | Value |
|-------|--------|
| **Status** | In progress |
| **Persona** | Admin / power user |
| **Surface** | Portal admin card and/or Quality settings tab |
| **Depends on** | Catalog APME settings APIs (`/apme/settings`, scan-target) |

## Story

> As an admin, I want to configure Quality defaults (e.g. target ansible-core,
> portal AI gate visibility) from the Portal, so teams share consistent scan
> defaults without editing app-config for every change.

## Acceptance criteria

- [x] User-facing settings UI for agreed knobs (ansible-core target at minimum;
      AI gate only if product still wants UI override of app-config).
- [x] Changes persist via existing portal settings store / Gateway-facing APIs.
- [x] Thin host only — no reintroduction of fat remediation admin flows.
- [ ] Verified in local loop.

## Notes

- Slim `ApmeQualitySettingsTab` via ADR-010 `getPageTabs()` →
  `/repositories/quality-settings`.
- Persists with `getPortalSettings` / `updatePortalSettings`
  (`PUT /apme/settings` → `ApmePortalSettingsStore`).
- AI gate shown read-only from settings (`ansible.apme.enableAi` app-config);
  not editable in UI.
- Dropped from prototype port: Rules admin, Fleet, `ApmeAdminCard`, Portal-side
  SCM, per-project scan-target UI (APIs remain for later).
