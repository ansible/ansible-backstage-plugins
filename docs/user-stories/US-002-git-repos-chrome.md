# US-002 — Git Repos chrome (chips + Run quality scan)

| Field | Value |
|-------|--------|
| **Status** | Planned |
| **Persona** | Developer |
| **Surface** | Self-service Git Repositories table / header (extension points) |
| **Depends on** | [US-001](US-001-quality-tab-scan-with-ai.md) (Quality tab workflow) |

## Story

> As a developer, I want to see quality status on the Git Repositories list and
> start a scan from there, so I can triage repos without opening each catalog
> entity’s Quality tab first.

## Acceptance criteria

- [ ] Git Repos table shows a **status chip** per registered repo (health / last
      scan / unscanned — exact chip set TBD from prototype `ApmeRepoStatusChip`).
- [ ] Header (or row) action **Run quality scan** starts (or deep-links into)
      the shared Quality workflow for that repo.
- [ ] Implemented as **thin host extensions** on eap-next — no in-repo MUI
      remediation steppers; scan UI remains `@apme/ui-workflow`.
- [ ] Wired via self-service / Git Repos extension factories (ADR-010 style);
      `dynamic-plugins.override.yaml` updated for RHDH Local.
- [ ] Verified in local loop (`make react` and/or `make sync` + RHDH).

## Out of scope

- Portal-side SCM commit (`RemediationPublisher`) — Gateway owns SCM (ADR-056).
- Fleet / multi-repo bulk analytics ([US-005](US-005-fleet-quality.md)).

## Notes

- First remaining product gap after US-001.
- Prototype reference: `prototype/apme` Git Repos chips + header chrome.
