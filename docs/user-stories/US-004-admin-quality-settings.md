# US-004 — Admin / Quality settings

| Field | Value |
|-------|--------|
| **Status** | Complete |
| **Persona** | Admin / power user |
| **Surface** | Git Repositories → **Quality settings** tab |
| **Depends on** | Catalog APME settings APIs (`/apme/settings`, scan-target) |
| **Craig journey** | [J6](user-journeys.md) |

## Story

> As an admin, I want to configure Quality defaults (e.g. target ansible-core,
> portal AI gate visibility) from the Portal, so teams share consistent scan
> defaults without editing app-config for every change.

## Acceptance criteria

- [x] User-facing settings UI for agreed knobs (ansible-core target at minimum;
      AI gate toggleable in UI with portal store override of app-config).
- [x] Changes persist via existing portal settings store / Gateway-facing APIs.
- [x] Thin host only — no reintroduction of fat remediation admin flows.
- [x] Saved global target prefills the Quality tab `CheckOptionsForm` (via
      `getProjectScanTarget` → effective = project → global → config).
- [x] Verified in local loop (unit tests + Portal tab wiring).

## How to verify (local)

1. Portal up with APME plugins (`automation-portal-local` `make dev` / reload).
2. Open **Git Repositories → Quality settings**.
3. Change **Target ansible-core**, toggle **AI-assisted remediation**, **Save** —
   success message; reload tab shows the new values.
4. Open a repo **Quality** tab — ansible-core field is prefilled with the saved
   global (unless a per-project override exists).
5. AI gate is editable in Quality settings (portal store overrides
   `ansible.apme.enableAi` after save). View-only users see a read-only status
   line.

```bash
yarn workspace @ansible/plugin-backstage-apme test \
  --watchAll=false \
  ApmeQualitySettingsTab resolveDefaultAnsibleVersionForScan
```

## Notes

- Slim `ApmeQualitySettingsTab` via ADR-010 `getPageTabs()` →
  `/repositories/quality-settings`.
- Persists with `getPortalSettings` / `updatePortalSettings`
  (`PUT /apme/settings` → `ApmePortalSettingsStore`).
- Prefill helper: `resolveDefaultAnsibleVersionForScan`.
- AI gate: UI toggle persists `global.enableAi` in the portal settings store;
  until set, app-config `ansible.apme.enableAi` is the default ([AAP-88783](https://redhat.atlassian.net/browse/AAP-88783)).
- AI provider CRUD (add/edit/remove Abbenay providers) is out of scope here —
  see [US-016](US-016-abbenay-providers-quality-settings.md).
- Dropped from prototype port: Rules admin, Fleet, `ApmeAdminCard`, Portal-side
  SCM, per-project scan-target UI (APIs remain for later).
- Upstream J6 also mentions gateway health / rules — out of slim EAP surface.
