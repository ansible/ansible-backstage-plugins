# US-007 — Scan triage (filter, acknowledge, history)

| Field | Value |
|-------|--------|
| **Status** | Planned |
| **Persona** | Repo owner |
| **Surface** | Entity **Quality** tab |
| **Craig journey** | [J2](user-journeys.md) |
| **Depends on** | [US-001](US-001-quality-tab-scan-with-ai.md) |

## Story

> As a repo owner, I want to filter findings by severity, category, or rule,
> acknowledge suppressions, and review scan history, so I can triage after a
> scan without leaving the Quality tab.

## Acceptance criteria

- [ ] Filter findings by severity, category, or rule (`?rule=` from fleet
      drill-down when fleet is available).
- [ ] Acknowledge findings toggles suppression; table matches gateway.
- [ ] **Scan history** lists past activities.
- [ ] EAP: Preview chip visible on Quality surfaces when product requires it.

## Out of scope

- Fleet estate analytics ([US-005](US-005-fleet-quality.md)).
- Remediate / PR path ([US-008](US-008-remediate-and-ship.md)).

## Notes

- Upstream: ansible-rhdh-plugins
  [`user-journeys.md` J2](https://github.com/ansible/ansible-rhdh-plugins/blob/docs/apme-productization/prototypes/apme/references/user-journeys.md).
- Thin host: triage UI remains in `@apme/ui-workflow` / gateway-backed APIs.
