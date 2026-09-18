# WP-045 — APME browser-state compatibility

| Field      | Value                                                                          |
| ---------- | ------------------------------------------------------------------------------ |
| Phase      | 9 — APME modularization                                                        |
| Depends on | WP-030                                                                         |
| Target     | APME frontend state migration and compatibility layer                          |
| Outcome    | Saved user state survives package, route, and dynamic-plugin extraction safely |

## Baseline versus extracted tests

Capture production-like fixtures using the current code for every `localStorage`, `sessionStorage`, URL/query/history, and client-cache key. Run the new compatibility adapter and state-resolution implementation against those immutable fixtures without requiring WP-032 artifacts. Do not regenerate baseline fixtures with the new code. WP-032 independently consumes the published fixtures/compatibility contract when validating its artifacts; that extraction is not a completion prerequisite for this WP.

## Human summary

**Why this matters:** Extracting the Ansible Policy & Modernization Engine (APME) content-quality frontend into a separate dynamic plugin must not erase saved model choices, filters, deep links, preferences, or navigation history. Existing state must also remain safe to read after an upgrade, rollback, removal, or reinstall.

**What will change:** Production-like browser-state fixtures will freeze current behavior, including the existing `AI_MODEL_STORAGE_KEY`. Model selection will prefer the server default, then the saved local value, then an available live model, while every user selection is written locally before best-effort server persistence.

**PR scope:** Capture immutable baseline fixtures, implement compatible state and route readers, define version and corruption handling for other browser contracts, test old and new readers together, publish fixtures for extraction testing, and add privacy-safe migration measurements.

**Not in this PR:** This work does not perform the package extraction owned by WP-032 or regenerate baseline fixtures from the new implementation. Tokens and server-authoritative data will not move into browser storage, and old readers or keys will not be removed before WP-039 retirement gates pass.

**Success looks like:** Supported selections, preferences, filters, content references, deep links, and history survive migration and rollback. Malformed or future state recovers without preventing startup or destroying data, and model selection remains usable offline or when server persistence fails.

## Scope and changes

Preserve the `AI_MODEL_STORAGE_KEY` imported from `@apme/ui-workflow` exactly across WP-030 frontend registration. Workflow model resolution order is server `defaultAiModelId`, then the local value, then live/provider fallback. The settings-page fallback is server, then local value, then the first live model. Selecting a model always writes the local value even when best-effort server persistence fails, so offline workflow operation continues. Inventory other key names, versions, JavaScript Object Notation (JSON) shapes, ownership, time to live (TTL), personally identifiable information (PII)/sensitivity, cross-tab behavior, route coupling, and corruption behavior, but do not invent a replacement key for this frozen contract. Tokens and server-authoritative state must never migrate into browser storage.

```ts
const selectedModelId =
  settings.defaultAiModelId ??
  storage.getItem(AI_MODEL_STORAGE_KEY) ??
  firstLiveProviderModel()?.id;

storage.setItem(AI_MODEL_STORAGE_KEY, selectedModelId);
void persistServerDefaultBestEffort(selectedModelId);
```

## Implementation slices

1. Capture immutable baseline fixtures for `AI_MODEL_STORAGE_KEY`, selection precedence, server-write failure, and other browser contracts.
2. Preserve the imported key and freeze any additional versioned schema, migration direction, TTL, and corruption policy.
3. Implement exact workflow/settings precedence, local write-through before best-effort server persistence, and route/query compatibility.
4. Test old/new state-reader alternation, rollback-compatible reads, cross-tab behavior, and removal/reinstall state retention in the package-level harness; publish the fixture contract for WP-032 artifact tests.
5. Add privacy-safe migration telemetry and old-key retirement gates.

## Required tests

- Each baseline fixture: valid, missing, partial, older/newer, malformed, oversized, Unicode, and malicious JSON values.
- Idempotent repeated migration, failed write, quota error, two tabs, old/new state-reader alternation, and rollback-compatible reads.
- Deep links, filters, selected content/digest, preferences, and history behavior.
- Workflow precedence: server default → `AI_MODEL_STORAGE_KEY` → live/provider fallback.
- Settings precedence: server default → `AI_MODEL_STORAGE_KEY` → first live model.
- Local selection remains written and usable when server persistence fails, is offline, or later recovers.
- No token/secret/sensitive finding is newly stored; Content Security Policy (CSP) and cross-site scripting (XSS)-sensitive rendering remains safe.
- Old-key reads are measurable without recording values or user-sensitive labels.

### Acceptance criteria

- Given current production-like state, the compatibility implementation preserves supported user-visible selections/preferences/routes and publishes immutable inputs/expected outputs for later extracted-artifact verification.
- Given a server default, it wins over local/live values; without one, the local key wins before live/provider fallback.
- Given best-effort server persistence failure, the new selection is still stored under `AI_MODEL_STORAGE_KEY` and workflows continue.
- Given malformed or future-version state, the plugin recovers safely without startup failure or destructive overwrite.
- Given rollback to a supported artifact, state remains readable per the compatibility matrix.
- Given the zero-usage window, old readers/keys are removed only through WP-039 gates.

## Rollback and completion

Retain read-old support and avoid destructive deletion until rollback support expires. Done means immutable baseline fixtures and package-level migration/compatibility suites pass; WP-032 must reuse them for install/upgrade/rollback/removal artifact scenarios.
