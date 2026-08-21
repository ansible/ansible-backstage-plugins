# US-012 — Entity catalog health (legacy layout)

| Field | Value |
|-------|--------|
| **Status** | Deferred |
| **Persona** | Catalog user |
| **Surface** | Catalog entity page (legacy layout) — Quality tab / `ApmeHealthCard` |
| **Craig journey** | [J10](user-journeys.md) |

## Story

> As a catalog user, I want a Quality tab or health card on entities outside
> the Git Repos detail layout, so I can see APME status from the stock catalog
> entity page.

## Acceptance criteria

- [ ] Quality tab and/or `ApmeHealthCard` available for linked entities on the
      catalog entity page.
- [ ] Health card reflects violation summary when the entity is APME-linked.
- [ ] Secondary to Git Repos detail Quality ([US-001](US-001-quality-tab-scan-with-ai.md))
      for Git Repos entities.

## Notes

- Upstream: ansible-rhdh-plugins
  [`user-journeys.md` J10](https://github.com/ansible/ansible-rhdh-plugins/blob/docs/apme-productization/prototypes/apme/references/user-journeys.md).
