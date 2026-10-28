# ADR-021: Template Type Taxonomy

**Audience:** `host` — see [ADR index](../index.md).

- **Status**: Accepted
- **Date**: 2026-06-23 (updated 2026-07-27)
- **Deciders**: Portal team

## Context

Historically, template entities in the portal catalog used `spec.type: service` regardless of origin. AAP job templates synced from the controller, custom scaffolder templates imported from GitHub/GitLab, and execution environment definitions all shared the same type, which made catalog-query filtering impossible.

`AAPJobTemplateProvider` (`dynamicJobTemplate.ts`) now emits `spec.type: automation-template` and `ansible.com/template-source: aap-template`. Remaining work is SCM template YAML in the templates repository and the self-service source filter.

The self-service page needs to distinguish template sources for filtering without using separate `spec.type` values per source — which would require new types for every future source (orchestrator, workflows, SCM). A single unified type with a source annotation is more scalable.

## Alternatives Considered

| Alternative                                                      | Source           | Why Rejected                                                                                                     |
| ---------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| Separate `spec.type` per source (`job-template`, `scm-template`) | Initial proposal | Creates a new type for every source; doesn't scale for orchestrator, workflows, future sources                   |
| Filter by `metadata.aapJobTemplateId` existence in catalog query | Current approach | Catalog API does not support "field not exists" filter; requires fetching all entities and filtering client-side |
| Keep `spec.type: service` and filter client-side                 | Status quo       | Works but sends unnecessary data over the wire; not architecturally clean                                        |

## Decision

Use a single unified type with a source annotation:

- **`spec.type: automation-template`** — all automation templates regardless of source
- **`ansible.com/template-source`** annotation — identifies the origin

| `ansible.com/template-source` | Source                                              | Description                                   | Status         |
| ----------------------------- | --------------------------------------------------- | --------------------------------------------- | -------------- |
| `aap-template`                | AAP Controller sync (`AAPJobTemplateProvider`)      | AAP job templates synced via catalog provider | In scope (912) |
| `scm`                         | SCM import (catalog locations, user "Add Template") | Scaffolder templates from GitHub/GitLab repos | In scope (912) |
| `aap-workflow`                | AAP Workflow Job Templates                          | AAP workflow templates                        | Document only  |
| `orchestrator`                | Automation Orchestrator                             | Orchestrator workflows                        | Document only  |

Execution environments retain `kind: Component` with `spec.type: execution-environment`. The type is distinct from `automation-template`; this decision does not introduce a custom catalog kind.

### Changes required

1. `dynamicJobTemplate.ts`: **done** — emits `type: 'automation-template'` and `ansible.com/template-source: aap-template`
2. `ansible-rhdh-templates` repository: update templates to use `type: automation-template` with `ansible.com/template-source: scm`
3. No changes for `execution-environment` — already uses a distinct type
4. Self-service UI: add source filter (collections-style) filtering by `ansible.com/template-source` annotation

### Catalog query and UI filtering

```typescript
// All automation templates (any source)
const allTemplates = await catalogApi.getEntities({
  filter: { kind: 'Template', 'spec.type': 'automation-template' },
});

// UI source filter narrows by annotation value (client-side, like collections source filter)
const aapOnly = allTemplates.filter(
  e =>
    e.metadata.annotations?.['ansible.com/template-source'] === 'aap-template',
);
```

## Consequences

### Positive

- Single type scales to any number of sources without new type registrations
- Source annotation enables fine-grained UI filtering without backend changes
- Consistent with the collections source filter pattern already in Portal
- Enables future RBAC conditional policies on `ansible.com/template-source`

### Negative

- Breaking change: `spec.type: service` → `automation-template` applies on all deployments regardless of `multiOrgEnabled` flag. Existing RBAC conditional policies filtering by `spec.type: service` will stop matching
- Requires a coordinated update across two repositories (upstream plugins + ansible-rhdh-templates)
- Migration guide must document the breaking change prominently

## Related

- ADR-020 — Multi-org namespace isolation (related)
