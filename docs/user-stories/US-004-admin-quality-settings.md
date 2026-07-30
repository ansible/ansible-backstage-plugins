# US-004 — Admin / Quality settings

| Field | Value |
|-------|--------|
| **Status** | Planned |
| **Persona** | Admin / power user |
| **Surface** | Portal admin card and/or Quality settings tab |
| **Depends on** | Catalog APME settings APIs (`/apme/settings`, scan-target) |

## Story

> As an admin, I want to configure Quality defaults (e.g. target ansible-core,
> portal AI gate visibility) from the Portal, so teams share consistent scan
> defaults without editing app-config for every change.

## Acceptance criteria

- [ ] User-facing settings UI for agreed knobs (ansible-core target at minimum;
      AI gate only if product still wants UI override of app-config).
- [ ] Changes persist via existing portal settings store / Gateway-facing APIs.
- [ ] Thin host only — no reintroduction of fat remediation admin flows.
- [ ] Verified in local loop.

## Notes

- Port from prototype `ApmeAdminCard` / `ApmeQualitySettingsTab` only what EAP
  still needs; drop anything tied to Portal-side SCM.
