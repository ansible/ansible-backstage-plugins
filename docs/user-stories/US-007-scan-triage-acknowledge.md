# US-007 — Scan triage (filter, acknowledge, history)

| Field | Value |
|-------|--------|
| **Status** | Complete |
| **Persona** | Repo owner |
| **Surface** | Entity **Quality activity** detail tab (scan start stays on **Quality**) |
| **Craig journey** | [J2](user-journeys.md) |
| **Depends on** | [US-001](US-001-quality-tab-scan-with-ai.md) |

## Story

> As a repo owner, I want to filter findings by severity, category, or rule,
> acknowledge suppressions, and review scan history, so I can triage after a
> scan from the repo Quality surfaces.

## Acceptance criteria

- [x] Filter findings by severity, category, or rule. Fleet **View details →**
      opens **Quality activity** for the latest scan with `?rule=` passed into
      `AssessFindingsPanel` (`initialRuleFilters`).
- [x] Acknowledge findings toggles suppression; open rows match gateway
      (host `createSuppression`, project scope).
- [x] **Scan history** lists past activities on **Quality activity** (sibling
      to CI Activity); row opens past scan via `?activity=`; detail closes with
      right-aligned **Close** (and browser Back) to return to the list.
- [x] EAP: Preview chip visible on Quality and Quality activity surfaces.

## Out of scope

- Fleet estate analytics ([US-005](US-005-fleet-quality.md)).
- Remediate / PR path ([US-008](US-008-remediate-and-ship.md)).
- Global SPA `/activity` page; Resume live op from history.

## Notes

- Upstream: ansible-rhdh-plugins
  [`user-journeys.md` J2](https://github.com/ansible/ansible-rhdh-plugins/blob/docs/apme-productization/prototypes/apme/references/user-journeys.md).
- Thin host: findings UI via `@apme/ui-workflow` `AssessFindingsPanel` (no
  `onRemediate` = history/read-only); list chrome + suppressions stay in the
  Portal plugin.
- Tab order (repo detail): Overview → Quality → Quality activity → CI Activity
  → Collections.
