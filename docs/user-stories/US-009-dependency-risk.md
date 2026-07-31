# US-009 — Dependency risk (Collections / Dependencies)

| Field | Value |
|-------|--------|
| **Status** | Planned |
| **Persona** | Repo owner or security |
| **Surface** | Repo detail → **Dependencies** / **Collections** |
| **Craig journey** | [J5](user-journeys.md) |

## Story

> As a repo owner or security reviewer, I want collection and Python dependency
> risk with violation context on the repo detail tabs, so I can see supply-chain
> issues alongside Quality findings.

## Acceptance criteria

- [ ] Dependencies / Collections tabs load via gateway
      `GET .../dependencies` (or equivalent portal proxy).
- [ ] Badges / counts match violation data where supported.
- [ ] Acknowledge supported where the gateway exposes it.
- [ ] Thin host only — no fat dependency remediator in the portal plugin.

## Notes

- Upstream: ansible-rhdh-plugins
  [`user-journeys.md` J5](https://github.com/ansible/ansible-rhdh-plugins/blob/docs/apme-productization/prototypes/apme/references/user-journeys.md).
- Both tabs ship in the EAP plugin pack per upstream journey notes.
