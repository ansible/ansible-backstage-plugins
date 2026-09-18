# PLAN: AAP-85231 — EE catalog entity not updated when re-creating an Execution Environment with the same name

| Field | Value |
| --- | --- |
| Jira | [AAP-85231](https://issues.redhat.com/browse/AAP-85231) |
| Priority | Major |
| Component | portal |
| Affects | portal-main |
| Base branch | `main` (`ansible/ansible-backstage-plugins`) |
| Status | **Implementation plan (approval gate)** — do not merge code until this plan is reviewed |

---

## 1. Executive summary

Re-creating an Execution Environment (EE) with a name that already exists in the Backstage catalog succeeds in the scaffolder UI, but the catalog `Component` entity often stays stuck on the **first** creation’s metadata.

Root cause: Backstage entities are uniquely identified by `kind + namespace + name` (e.g. `Component:default/ee1`). Ownership of that slot is guarded by a `locationKey`. Our two EE registration paths use **different** `locationKey` values:

| Path | How entity enters catalog | `locationKey` |
| --- | --- | --- |
| Publish to SCM | Template step `catalog:register` on `catalog-info.yaml` URL | The catalog-info URL (location target) |
| Download-only / non-SCM | `POST /ansible/ee` → `EEEntityProvider.registerExecutionEnvironment` | Literal `"EEEntityProvider"` |

When the second run uses a **different** path or a **different** SCM repo, the catalog rejects the new claim as a conflict. The SCM template step sets `optional: true` on `catalog:register`, so the conflict is **silently swallowed** and the task still reports success.

Only **non-SCM → non-SCM** works today, because both runs share `locationKey: "EEEntityProvider"` and the delta mutation can upsert.

**Fix direction:** Before registering a new EE under a given name, best-effort **remove** any existing EE entity with that name (and its SCM location when applicable), then proceed with the normal SCM or non-SCM registration path. Align the EEFileNamePicker warning copy with that replace semantics.

---

## 2. Confirmed reproduction matrix (from Jira + code)

| Run 1 | Run 2 | Entity updated today? | Why |
| --- | --- | --- | --- |
| SCM repo A | SCM repo B | **No** | New `locationKey` (repo B URL) conflicts with entity owned by repo A URL; `optional: true` hides failure |
| SCM | No SCM | **No** | Provider tries to claim with `locationKey: "EEEntityProvider"` while entity is owned by SCM URL |
| No SCM | SCM | **No** | `catalog:register` tries SCM URL key while entity is owned by `"EEEntityProvider"` |
| No SCM | No SCM | **Yes** | Same `locationKey` (`"EEEntityProvider"`); delta `added` upserts |

Acceptance criteria require all four scenarios to update the catalog entity after the fix, without regressing unique-name creation.

---

## 3. Line-level analysis of the current code

### 3.1 `EEEntityProvider` — add-only delta, never remove

**File:** `plugins/catalog-backend-module-rhaap/src/providers/EEEntityProvider.ts`

| Lines | What they do | Bug relevance |
| --- | --- | --- |
| 7–15 | Class implements `EntityProvider`; `getProviderName()` returns `"EEEntityProvider"` | This string **is** the `locationKey` for every non-SCM EE. Any competing claimant with a different key loses. |
| 17–20 | `connect()` stores `EntityProviderConnection` | Required before mutations; DELETE path must use the same connected instance. |
| 22–37 | Validates `metadata.name` and `spec.type === "execution-environment"` | Good guard; DELETE must reuse the same type filter so we never remove non-EE components named similarly. |
| 39 | Logs registration | Fine. |
| **41–50** | `applyMutation({ type: 'delta', added: [{ entity, locationKey: this.getProviderName() }], removed: [] })` | **Core gap:** `removed` is always empty. There is no API to drop a prior claim. Same-key upsert works; cross-key replace is impossible from this method alone. |

**Missing method (to add):** `unregisterExecutionEnvironment(name: string)` (or `entityRef`) that issues:

```ts
await this.connection.applyMutation({
  type: 'delta',
  added: [],
  removed: [
    {
      entityRef: `component:default/${name}`, // normalize kind/namespace casing per Backstage conventions
      locationKey: this.getProviderName(),
    },
  ],
});
```

Notes from Backstage catalog semantics:

- Entity uniqueness is the `kind:namespace/name` triplet; conflicts occur when a second emitter uses a **different** non-empty `locationKey` for the same ref.
- Delta `removed` accepts `{ entityRef, locationKey? }` (see `EntityProviderMutation` in `@backstage/plugin-catalog-node`).
- Removing via the **provider** only clears entities this provider owns (`locationKey === "EEEntityProvider"`). SCM-owned entities must be cleared via **location removal** (or `removeEntityByUid`), not only this delta.

Existing tests in `EEEntityProvider.test.ts` assert `removed: []` on register — update those expectations when adding unregister coverage.

---

### 3.2 `POST /ansible/ee` router — register only, no DELETE

**File:** `plugins/catalog-backend-module-rhaap/src/router.ts`

| Lines | What they do | Bug relevance |
| --- | --- | --- |
| 68–99 | `createRouter` receives `eeEntityProvider` **and** `catalogClient` | DELETE handler already has both dependencies available — no module wiring change required beyond using them. |
| **338–367** | `POST /ansible/ee`: service-auth only; body `{ entity }`; calls `registerExecutionEnvironment` | Non-SCM create path. Does **not** clean an existing SCM-owned entity first, so non-SCM after SCM fails at catalog conflict inside the provider mutation (surfaced as 500 today for non-SCM; for SCM the conflict is hidden by `optional: true`). |
| 369+ | `POST /ansible/ee/build` etc. | Unrelated; do not change. |

**Missing route (to add):** `DELETE /ansible/ee/:name`

Suggested behaviour (detailed in §5):

1. Auth: same as POST — **service credentials only** (`httpAuth.credentials(request, { allow: ['service'] })`), because the scaffolder action will call it with a plugin request token (mirrors POST).
2. Resolve `Component:default/${name}` via `catalogClient.getEntityByRef`.
3. If missing → `200`/`204` no-op (idempotent cleanup).
4. If present but `spec.type !== 'execution-environment'` → `400`/`409` reject (acceptance: “only removes execution-environment entities”).
5. If EE:
   - Prefer location-based unregister when a catalog `Location` exists for the entity (`getLocationByEntity` / origin annotation → `removeLocationById`) so the Location processor cannot re-import stale `catalog-info.yaml` on the next cycle.
   - Else (provider / bootstrap / download-experience with no real location): call `eeEntityProvider.unregisterExecutionEnvironment(name)` and/or `catalogClient.removeEntityByUid(uid)` as fallback.
6. Errors during cleanup: log and return a non-blocking response contract that the scaffolder treats as best-effort (see §5.3) — **or** return 200 with `{ cleaned: false, reason }` so the caller never aborts creation. Preference: **best-effort at the caller**; DELETE can still return accurate status codes for testability, while `createEEDefinition` ignores failures.

Align with existing UI unregister logic in:

- `plugins/self-service/src/components/UnregisterEntityDialog/useUnregisterEntityDialogState.ts`
  - Location-backed → `removeLocationById`
  - No location → `removeEntityByUid`
  - Bootstrap special-case → delete by uid

Mirror that decision tree on the backend so SCM vs provider cleanup is consistent with what users already do manually in the EE catalog UI.

---

### 3.3 `createEEDefinition` — registers non-SCM; never cleans first

**File:** `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/createEEDefinition.ts`

| Lines | What they do | Bug relevance |
| --- | --- | --- |
| 85–115 | Handler starts; canonicalizes `eeFileName` via `canonicalizeEEDefinitionName` + `validateSafeEEDefinitionName` | Cleanup must use the **same** canonical name that will become `metadata.name`, otherwise we delete the wrong entity or miss the conflict. |
| 117–321 | Scaffold creator service, write files, generate README/template | Heavy work **before** catalog touch. Cleanup should run **early** (right after name validation / before or immediately after workspace setup) so we do not leave orphan SCM publishes without catalog updates… Actually: Jira says “early in the handler, before any registration”. Publishing to a new repo while leaving the old catalog entity is still wrong UX, but cleanup-before-publish is correct so `catalog:register` later succeeds. |
| **323–363** | Branch: `publishToSCM` → only outputs `catalogInfoPath`; else `POST ${catalogBase}/ansible/ee` with generated entity | Non-SCM registration only. SCM registration is deferred to the template’s `catalog:register` step. **Neither path cleans first.** |
| 336–345 | `generateEECatalogEntity(...)` embeds definition/readme/cfg/template; annotations include `ansible.io/download-experience: 'true'` and fake `url:127.0.0.1` managed-by locations | Distinguishes download-experience entities in the UI; location annotations are **not** real catalog Locations (see Unregister dialog `only-delete` path). |
| 400–434 | `generateEECatalogEntity` body | Unchanged by fix except callers may run after cleanup. |

**Change:** After `eeFileName` is finalized (~line 102–113), call cleanup:

```ts
await bestEffortUnregisterExistingEE({
  name: eeFileName,
  discovery,
  auth,
  logger,
});
```

Implementation sketch:

1. `discovery.getBaseUrl('catalog')`
2. Service token via `auth.getPluginRequestToken({ onBehalfOf: await auth.getOwnServiceCredentials(), targetPluginId: 'catalog' })`
3. `fetch(`${baseUrl}/ansible/ee/${encodeURIComponent(eeFileName)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })`
4. On non-OK / network error: `logger.warn(...)` and **continue** (AC: cleanup failure must not block creation).

Update `createEEDefinition.test.ts`:

- Assert DELETE is attempted (mock `fetch`) for both `publishToSCM: true` and `false`.
- Assert creation still succeeds when DELETE returns 500 / throws.
- Assert DELETE uses the canonicalized name.

---

### 3.4 Template YAML generator — `catalog:register` with `optional: true`

**File:** `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/templates/eeTemplate.ts`

| Lines | What they do | Bug relevance |
| --- | --- | --- |
| 475–495 | `catalog:write` writes `catalog-info.yaml` Component with `metadata.name: ${{ parameters.eeFileName }}` | Same name → same entity ref. Different repos → different future location URLs. |
| 497–542 | publish github/gitlab / PR / MR | Files land correctly (user observation); catalog is the broken part. |
| **544–550** | `catalog:register` with `catalogInfoUrl` from prepare-publish; **`optional: true`** | **Silent failure valve.** When registration conflicts, scaffolder continues; task “succeeds”; catalog stays stale. |

**Plan decision on `optional: true`:**

| Option | Pros | Cons |
| --- | --- | --- |
| **A. Keep `optional: true` + pre-cleanup** (recommended) | Matches Jira proposed fix; transient catalog blips don’t fail the whole publish; cleanup makes conflicts rare | If cleanup fails *and* conflict remains, user still sees success with stale catalog (mitigate with warn logs + optional scaffolder log line) |
| B. Set `optional: false` | Surfaces conflicts to the user | Breaks soft-failure philosophy; flakes if catalog temporarily unavailable after push |
| C. Both: cleanup + `optional: false` | Strictest | Higher false-negative task failures |

**Recommendation:** Option A for the first PR. Optionally add a follow-up to emit a clearer scaffolder log if register returns conflict. Do **not** change `optional` unless QA/product asks for hard failures.

No other template steps need changes for the core bug. Name used in `catalog:write` must remain the same parameter the picker validates.

---

### 3.5 `EEFileNamePickerExtension` — misleading warning

**File:** `plugins/self-service/src/components/Scaffolder/EEFileNamePicker/EEFileNamePickerExtension.tsx`

| Lines | What they do | Bug relevance |
| --- | --- | --- |
| 42–101 | `isValidEntityName` — Backstage name rules | Correct; keep. |
| 129–185 | Debounced `catalogApi.getEntityByRef('Component:default/${fileName}')`; only warns if `spec.type === 'execution-environment'` | Correct detection of the colliding EE. |
| **261–276** | Warning text: *“If you proceed, your existing definition will be updated with the new information.”* | **False in 3/4 scenarios today.** After fix, replace is true — text should say **replaced**, not vaguely “updated”, and ideally note that the previous catalog entry (and SCM location registration) will be removed. |

Suggested copy (AC: “accurately reflects that the existing definition will be replaced”):

> **Warning:** An execution environment definition named "{name}" already exists in the catalog.  
> If you proceed, the existing catalog entry will be **replaced** with this new definition (including its source / download metadata).

Update matching assertion in `EEFileNamePickerExtension.test.tsx` (~lines 458–485).

---

### 3.6 Supporting context (not primary change sites)

| Area | Relevance |
| --- | --- |
| `UnregisterEntityDialog` / `useUnregisterEntityDialogState` | Reference implementation for location vs uid deletion; users can manually fix stale entities today — proves APIs work. |
| `module.ts` wiring of `EEEntityProvider` + `CatalogClient` | Already correct; DELETE uses existing `createRouter` deps. |
| `canonicalizeEEDefinitionName` | Critical that picker name and backend name stay aligned (picker uses raw form value for catalog lookup; action canonicalizes). **Edge case to verify:** if picker allows `My-EE` and action lowercases to `my-ee`, lookup uses `Component:default/My-EE` while entity may be stored as `my-ee`. Confirm current behaviour with tests; if mismatch exists, it’s a separate bug — for this fix, DELETE must use the **canonical** name the action will register. |
| Home / EE catalog filters (`spec.type: execution-environment`) | Unchanged; they will simply see the replaced entity. |

---

## 4. Why Backstage rejects the second registration (catalog model)

1. Catalog DB uniqueness: one row per entity ref (`component:default/ee1`).
2. Each final entity carries a `location_key` claiming ownership.
3. If emitter B tries to emit the same ref with a **different** `location_key`, processing records a conflict and **does not overwrite** entity A’s data (Backstage maintainers: no merging; first claim wins until removed).
4. `catalog:register` with `optional: true` treats registration failure as non-fatal → scaffolder green.
5. Provider delta with matching `locationKey` updates in place → explains why non-SCM → non-SCM works.

Therefore the durable fix is **remove the old claim** (entity + location as needed), then emit the new claim — not “force overwrite” via a nonexistent catalog API.

---

## 5. Proposed solution (implementation design)

### 5.1 Architecture

```text
Scaffolder action ansible:create:ee-definition
  │
  ├─ canonicalize + validate eeFileName
  ├─ DELETE /api/catalog/ansible/ee/:name   ◄── NEW (best-effort)
  │     │
  │     ├─ load Component:default/:name
  │     ├─ reject if not execution-environment
  │     ├─ if SCM/location-managed → removeLocationById (drops location + entities)
  │     └─ if provider-managed → EEEntityProvider.unregisterExecutionEnvironment
  │                              (+ removeEntityByUid fallback if needed)
  │
  ├─ scaffold files / creator service (existing)
  │
  ├─ if publishToSCM
  │     └─ later template: catalog:write → publish → catalog:register (optional: true)
  └─ else
        └─ POST /ansible/ee → EEEntityProvider.registerExecutionEnvironment
```

### 5.2 File-by-file change list

| # | File | Change |
| --- | --- | --- |
| 1 | `plugins/catalog-backend-module-rhaap/src/providers/EEEntityProvider.ts` | Add `unregisterExecutionEnvironment(name: string)` with delta `removed` |
| 2 | `plugins/catalog-backend-module-rhaap/src/providers/EEEntityProvider.test.ts` | Unit tests for unregister success, not-connected, validation |
| 3 | `plugins/catalog-backend-module-rhaap/src/router.ts` | Add `DELETE /ansible/ee/:name` with type guard + location/provider cleanup |
| 4 | `plugins/catalog-backend-module-rhaap/src/router.test.ts` | Tests: provider EE delete, SCM location delete, missing entity, wrong type, auth |
| 5 | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/createEEDefinition.ts` | Best-effort DELETE early in handler |
| 6 | `plugins/scaffolder-backend-module-backstage-rhaap/src/actions/createEEDefinition.test.ts` | Assert DELETE called; failure does not fail action |
| 7 | `plugins/self-service/.../EEFileNamePickerExtension.tsx` | Replace warning copy |
| 8 | `plugins/self-service/.../EEFileNamePickerExtension.test.tsx` | Update expected string |

Optional (same PR if small): extract shared helper `unregisterExistingExecutionEnvironment(name, deps)` in catalog module to keep router thin.

### 5.3 DELETE endpoint — detailed algorithm

```text
DELETE /ansible/ee/:name
Auth: service only (same as POST)

1. Sanitize :name
   - reject empty, path segments, `..`, NUL (reuse same rules as validateSafeEEDefinitionName or encodeURIComponent + basename check)
2. entityRef = `component:default/${name}`
3. entity = await catalogClient.getEntityByRef(entityRef, { token })
   - if !entity → 204 No Content (nothing to clean)
4. if entity.kind !== 'Component' OR entity.spec?.type !== 'execution-environment'
   → 400 { error: 'Refusing to delete non-execution-environment entity' }
5. Try location cleanup:
   location = await catalogClient.getLocationByEntity(entityRef, { token })
   if location?.id:
     await catalogClient.removeLocationById(location.id, { token })
     → 200 { success: true, mode: 'location' }
6. Else provider cleanup:
   await eeEntityProvider.unregisterExecutionEnvironment(name)
   // If entity still present (defensive):
   if entity.metadata.uid:
     await catalogClient.removeEntityByUid(entity.metadata.uid, { token })
   → 200 { success: true, mode: 'provider' }
7. On unexpected errors → 500 (scaffolder caller logs and continues)
```

**SCM re-import prevention:** Removing the Location is mandatory for SCM-managed EEs. Deleting only the entity while leaving the Location causes the catalog location processor to re-add the old `catalog-info.yaml` entity on the next processing loop — exactly AC item “old catalog location is also removed”.

**Colocated entities:** `removeLocationById` unregisters **all** entities from that location. EE templates typically write a single Component in `catalog-info.yaml`. Document this assumption; if a repo’s catalog-info ever gains sibling entities, deleting the EE by location would remove those too. Acceptable for current EE publisher (single component); call out in PR description.

### 5.4 Timing of cleanup relative to SCM publish

Cleanup runs **before** publish/register:

- Old catalog claim is freed.
- New repo (or non-SCM POST) can claim `Component:default/ee1`.
- Old git repo is **not** deleted (out of scope). Stale `catalog-info.yaml` may remain in repo A but is no longer imported once the Location is removed. Document as known leftover; optional future enhancement: warn user that repo A still contains old files.

### 5.5 UI warning

Update copy to “replaced” semantics (§3.5). Do not promise “updated in place” which implies merge.

### 5.6 Out of scope

- Deleting or rewriting remote git history / old repos
- Changing `optional: true` on `catalog:register` (unless product requests hard fail)
- Migrating existing duplicate conflict error rows in catalog DB beyond removing the entity/location for the name being re-created
- Renaming EEs (different problem)
- RBAC redesign for DELETE (service-to-service only, like POST)

---

## 6. Test plan

### 6.1 Automated unit/integration

| Area | Cases |
| --- | --- |
| `EEEntityProvider` | unregister issues delta with correct `entityRef` + `locationKey`; throws if not connected |
| `DELETE /ansible/ee/:name` | 204 when missing; 400 when wrong type; location path calls `removeLocationById`; provider path calls unregister; service auth required |
| `createEEDefinition` | DELETE before POST when non-SCM; DELETE even when `publishToSCM: true`; DELETE failure → action still succeeds; name encoding |
| `EEFileNamePicker` | Warning contains “replaced” (or agreed final copy) |

### 6.2 Manual / E2E acceptance (from Jira)

1. SCM A → SCM B: catalog entity shows repo B metadata / managed-by location for B.
2. SCM → non-SCM: entity shows download-experience annotation and embedded definition from second run.
3. Non-SCM → SCM: entity shows SCM annotations / repo URL; download-experience cleared as written by `catalog:write`.
4. Non-SCM → non-SCM: still upserts; no regression.
5. Unique new name: SCM and non-SCM unchanged.
6. Force cleanup failure (mock 500): scaffolder task still completes; log warning present.
7. Attempt DELETE for a non-EE Component with same name shape: rejected.

### 6.3 Regression commands

```bash
yarn workspace @ansible/backstage-plugin-catalog-backend-module-rhaap test
yarn workspace @ansible/plugin-scaffolder-backend-module-backstage-rhaap test
yarn workspace @ansible/plugin-backstage-self-service test EEFileNamePicker
```

---

## 7. Implementation sequence (suggested PR commits)

1. **Provider:** `unregisterExecutionEnvironment` + unit tests  
2. **Router:** `DELETE /ansible/ee/:name` + router tests  
3. **Scaffolder action:** best-effort cleanup call + tests  
4. **UI:** warning copy + test update  
5. **Manual verification** against local Backstage + two GitHub repos  

Keep the fix in **one** PR against `main` unless review prefers splitting UI copy.

---

## 8. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| `removeLocationById` removes colocated non-EE entities in same catalog-info | Current EE publisher writes one Component; document; consider entity-uid-only delete + separate location delete only when colocated count === 1 (enhancement if needed) |
| Race: two concurrent creates for same name | Last writer wins after dual cleanup; acceptable |
| Cleanup succeeds but register fails | User may temporarily lose catalog entry; task error (non-SCM) or optional register (SCM) — same as today’s failure modes but more visible for non-SCM |
| Token / auth mismatch on DELETE | Mirror POST’s `getPluginRequestToken` + service allow list exactly |
| Picker name vs canonical name mismatch | DELETE uses action’s canonical `eeFileName`; consider follow-up to canonicalize in the picker |
| Stale Location re-import if only entity deleted | Always remove Location when present |

---

## 9. Success criteria (Definition of Done)

- [ ] All four scenario matrix rows update the catalog entity to the latest creation
- [ ] SCM replace removes old Location (no re-import of stale catalog-info)
- [ ] Provider replace uses delta `removed` before re-add
- [ ] Cleanup failures do not fail the scaffolder task
- [ ] Warning text matches replace behaviour
- [ ] Unique-name create unchanged
- [ ] DELETE rejects non-`execution-environment` entities
- [ ] Existing EEEntityProvider + router tests pass; new tests added
- [ ] Jira AAP-85231 linked on the implementation PR

---

## 10. Open questions for reviewers (answer before / during implementation)

1. Confirm **Option A** (`optional: true` retained) vs hard-fail on `catalog:register`.
2. Confirm DELETE auth stays **service-only** (not end-user token).
3. Preferred warning microcopy (exact string).
4. If colocated entities ever appear in EE `catalog-info.yaml`, should we refuse location delete and fall back to uid-only + orphan Location warning?

---

## 11. Appendix — key code references (current `main`)

```41:50:plugins/catalog-backend-module-rhaap/src/providers/EEEntityProvider.ts
    await this.connection.applyMutation({
      type: 'delta',
      added: [
        {
          entity,
          locationKey: this.getProviderName(),
        },
      ],
      removed: [],
    });
```

```544:550:plugins/scaffolder-backend-module-backstage-rhaap/src/actions/templates/eeTemplate.ts
    - id: register-catalog-component
      name: Register published EE as a Catalog Component
      action: catalog:register
      if: ${{ parameters.publishAndBuild.publishToSCM }}
      input:
        catalogInfoUrl: ${{ steps['prepare-publish'].output.generatedCatalogInfoUrl }}
        optional: true
```

```323:363:plugins/scaffolder-backend-module-backstage-rhaap/src/actions/createEEDefinition.ts
        if (values.publishToSCM) {
          const catalogInfoPath = path.join(
            contextDirName,
            'catalog-info.yaml',
          );
          ctx.output('catalogInfoPath', catalogInfoPath);
        } else {
          // ... POST /ansible/ee ...
        }
```

```261:274:plugins/self-service/src/components/Scaffolder/EEFileNamePicker/EEFileNamePickerExtension.tsx
      {existingEntity && !isChecking && !formatError && (
        <Alert ...>
          ...
            If you proceed, your existing definition will be updated with the
            new information.
```

---

## 12. Next step after plan approval

Implement §5 on a branch `fix/AAP-85231-ee-catalog-entity-replace` from latest `main`, open implementation PR to `ansible/ansible-backstage-plugins` `main`, link Jira AAP-85231, and execute §6 test plan.
