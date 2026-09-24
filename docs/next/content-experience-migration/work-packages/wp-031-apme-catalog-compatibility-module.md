# WP-031 — APME Catalog compatibility module

| Field           | Value                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------- |
| Phase           | 9 — APME modularization                                                                  |
| Depends on      | WP-029                                                                                   |
| Target          | APME compatibility backend module                                                        |
| Frozen identity | Module `apme-compatibility` targeting plugin `catalog`                                   |
| Outcome         | Exact legacy `/api/catalog/apme/*` routes and SSE delegate to typed APME APIs/operations |

## Human summary

**Why this matters:** Existing consumers of `/api/catalog/apme/*` need time to migrate without losing access when Ansible Policy & Modernization Engine (APME) moves to its new typed application programming interfaces (APIs) and operations.

**What will change:** A compatibility module will translate every legacy request, response, error, authorization check, and Server-Sent Events (SSE) stream to the new APME interfaces.

**PR scope:** Cover every legacy route and stream from the baseline inventory, preserve observable behavior, add usage and deprecation telemetry, and connect retirement to the planned compatibility-removal process.

**Not in this PR:** The module will not contain APME business logic, scanners, persistence, source clients, or direct database access. It will not replace or alter the normalized APME APIs.

**Success looks like:** Legacy consumers behave as before while all data and processing come from the canonical APME backend. The compatibility module can later be removed without affecting normalized APME functionality.

## Scope and changes

Create the frozen catalog-targeting compatibility module. It owns only legacy `/api/catalog/apme/*` request, response, error, auth, and SSE translation. It uses a typed APME client and operation descriptors; it must not implement APME business logic, persistence, scanners, source clients, or direct database access.

```ts
export const apmeCatalogCompatibilityModule = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'apme-compatibility',
  register(env) {
    /* mount exact legacy route adapters */
  },
});
```

## Implementation slices

1. Generate exact legacy route/SSE coverage from WP-001.
2. Add typed APME client/operation translation for each route.
3. Preserve auth/status/body/header/streaming behavior with safe approved exceptions only.
4. Add route usage/deprecation telemetry and runtime-ledger ownership.
5. Migrate consumers and connect removal to WP-039.

## Required tests

- Golden success, validation, not-found, denied, upstream-failure, and SSE fixtures for every route.
- Runtime registration is module `apme-compatibility` targeting `catalog`; duplicate route owner fails.
- Architecture forbids DB/repository/scanner/source-protocol imports.
- Typed APME client timeout/cancellation/error and SSE reconnect mapping.
- Usage telemetry, redaction, and no authorization weakening.

### Acceptance criteria

- Given a legacy `/api/catalog/apme/*` request, response/stream behavior matches baseline through the typed APME boundary.
- Given canonical APME changes, compatibility routes reflect them without duplicate state.
- Given module removal, normalized APME APIs continue unaffected.
- Given zero-usage and parity evidence, retirement follows WP-039 rather than ad hoc deletion.

## Rollback and completion

Reinstall/re-enable this module without changing APME state. Done means every legacy route is accounted for and exact identity/target tests pass.
