# US-010 — Background estate scan

| Field | Value |
|-------|--------|
| **Status** | Deferred |
| **Persona** | Platform (automated) |
| **Surface** | No UI — Backstage `SchedulerService` |
| **Craig journey** | [J8](user-journeys.md) |
| **Scope** | GA only |

## Story

> As a platform operator, I want batch register/scan via the catalog sync
> scheduler so projects appear without a manual Scan on every repo.

## Acceptance criteria

- [ ] Deferred for EAP default — bulk sync off (`scanOnRegister: false` in
      welcome-pack Helm values).
- [ ] Scheduler task registers/scans per catalog sync config (ADR-009 /
      upstream plan configuration).
- [ ] Operator can enable via YAML / Helm; projects appear without manual Scan.

## Notes

- Upstream: ansible-rhdh-plugins
  [`user-journeys.md` J8](https://github.com/ansible/ansible-rhdh-plugins/blob/docs/apme-productization/prototypes/apme/references/user-journeys.md).
- Do not block eap-next Git Repos chrome stories on automated estate scan.
