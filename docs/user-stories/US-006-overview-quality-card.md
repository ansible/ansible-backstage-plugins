# US-006 — Overview Quality card (sidebar above About)

| Field | Value |
|-------|--------|
| **Status** | Complete |
| **Persona** | Developer |
| **Surface** | Git repository detail → Overview tab (right column) |
| **Depends on** | [US-001](US-001-quality-tab-scan-with-ai.md) (Quality tab) |

## Story

> As a developer, I want a concise quality summary on the repository Overview
> next to About (not above the README), so I can see scan status without the
> report dominating the page.

## Acceptance criteria

- [x] Overview right column shows a **Quality** card **above** the About card
      (via `getDetailOverviewSlots`).
- [x] Left column remains README-only (no quality card above README).
- [x] Unscanned repo: empty state with **Scan** → opens Quality tab
      (`CheckOptionsForm`; does not auto-start).
- [x] Clean scan: “No violations detected” message.
- [x] With violations: count, severity strip, category rows; **View details →**
      and category clicks open Quality (`?tab=quality`, optional `category=`).
- [x] Implemented as thin host extension (ADR-010); card lives in
      `@ansible/plugin-backstage-apme`.

## Out of scope

- Fleet Quality ([US-005](US-005-fleet-quality.md)).
- Auto-starting scans from Overview.
- Moving the card above README (prototype left-column placement).

## Notes

- Host contract: `getDetailOverviewSlots` on
  `@ansible/backstage-rhaap-common/gitRepositoriesExtensions`.
- Self-service renders slots in `detailsRightColumn` above
  `RepositoryAboutCard`.
