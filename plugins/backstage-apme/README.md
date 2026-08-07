# backstage-apme

Frontend Backstage plugin for **APME** (Ansible Policy & Modernization Engine). Surfaces content quality scanning, violation remediation, and fleet health in the Ansible Automation Portal.

## Features

- **Quality tab** — violations list with severity/fix-type filters, scan, and remediation flow
- **Repo status chip** — extension point consumed by self-service Git Repositories
- **Admin integration card** — APME Gateway connection status and repository count
- **Entity integration** — Quality tab and health card on catalog entities
- **Toggleable** — zero UI/backend footprint when `apme.enabled` is `false`

## Configuration

```yaml
ansible:
  apme:
    enabled: true
    baseUrl: http://localhost:8080
    checkSSL: false
    # Optional: skip AAP OAuth on Add repository (RHDH Local / no AAP).
    # Default false — Portal keeps Self-service Create + AAP login.
    # useStockCreateForRegister: true
```

## Getting started

From the monorepo root:

```bash
yarn start
```

In the prototype, APME UX is under **Git Repositories** (there is no standalone `/apme` page — legacy `/apme` URLs redirect to the catalog):

- **Fleet overview:** `/self-service/repositories/catalog/quality`
- **Catalog + violation chips:** `/self-service/repositories/catalog`
- **Per-repo scan/remediation:** open a Git repository entity → **Quality** tab

Start the APME Gateway locally (`tox -e build && tox -e up` in the APME repo) before exercising scan/remediation flows.

**Local dev vs RHDH dynamic plugins:** [plan.md Appendix](https://github.com/ansible/ansible-rhdh-plugins/blob/docs/apme-productization/prototypes/apme/plan.md#openshift-operators) — `yarn start` vs `rhdh-cli` export and operator deploy.

## Related packages

| Package                                                 | Role                                 |
| ------------------------------------------------------- | ------------------------------------ |
| `@ansible/backstage-apme-common`                        | Shared types and Gateway client      |
| `@ansible/backstage-plugin-catalog-backend-module-apme` | Catalog proxy routes to APME Gateway |

## Extension points

- `ApmeRepoStatusChip` — render violation status for a repository URL
- `ApmeAdminCard` — integration status card for admin/settings views
- `ApmeEntityTab` / `QualityTab` — entity and repository quality views
