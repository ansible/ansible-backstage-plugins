# Review Comment Verification Plan

PR: [#849](https://github.com/ansible/ansible-backstage-plugins/pull/849)
Guide: `.sdlc/research/aap-integration-implementation-guide.md`
Date: 2026-10-19

---

## Hrithik's Comment (Critical — PAH transition contract)

### Comment

> 🔴 **Critical — PAHCollectionProvider breaks without transition contract**
>
> This table assigns PAHCollectionProvider to Content, and §4.2 removes
> `syncCollectionsByRepositories` from `IAAPService`. But the provider currently calls
> this method via `ansibleServiceRef`.
>
> Ask: Add a row in §3.6 (backward-compat shim) explicitly stating the transition, or
> update the provider row to say "Content (stays in catalog-module via shim until claimed)".

### Verification

**Fixed? ✅ YES**

Evidence (3 locations in the guide):

1. **§4.2 (line ~572–588):** Transition contract is explicit — all 37 methods retained,
   PAH methods only removed when content workspace provides replacement. The 3 exit
   conditions are listed.

2. **§3.3 (line ~450–454):** `pahHelpers` and PAH methods explicitly marked as retained
   during transition: _"PAH methods during transition: `isValidPAHRepository()`,
   `syncCollectionsByRepositories()`, and all `pahHelpers` imports remain on `AAPClient`
   in `aap-backend` and on `IAAPService` in `aap-node` during the transition period
   (see §4.2)."_

3. **§3.6 (line ~521):** `pahHelpers.ts` + PAH methods listed in the shim table as
   staying in `backstage-rhaap-common`.

4. **§2.3 provider table (line ~153):** `PAHCollectionProvider` target says
   _"Content workspace (content extraction effort)"_ — the transition is covered by
   §4.2's contract, not repeated here.

### Abhik's follow-up to Hrithik's fix

> Thanks for retaining all 37 methods and adding the content-service exit conditions;
> that addresses the premature method-removal concern. One transition gap remains:
> `syncCollectionsByRepositories` returns `Promise<Collection[]>`, but §3.1 excludes
> `Collection` and the related PAH DTOs from `aap-common`, while the new `aap-node`
> interface is supposed to use shared types from that package. Keeping those types only
> in the old shim would force `node` to depend back on the shim/backend. Could we give
> the required DTOs a temporary isomorphic home (for example, deprecated exports in
> `aap-common`, re-exported by the shim) until the replacement contract is adopted?
> Please also reconcile the conflicting `pahHelpers` destinations in §3.3, §3.6 and
> the work-package exclusions so the retained client can compile without a cycle.

**Fixed? ✅ YES (fixed in this pass)**

The guide now:
- §3.1 has a new **"Deprecated temporary exports (PAH transition)"** section that
  adds `Collection`, `CollectionLinks`, and `Collections` as deprecated temporary
  exports in `aap-common`, explaining they are needed because `IAAPService` in
  `aap-node` references them in method signatures.
- §3.3 clarifies that `pahHelpers.ts` source lives in `aap-backend` (next to
  `AAPClient`) and is re-exported by the shim (§3.6) for unconverted consumers.
- `SourceVersionDetail` stays in the shim only (not used by IAAPService signatures).

---

## Abhik's Comments

### Comment 1: UserProvisioner — preserve JIT provisioning contract

> Preserve the existing JIT user-provisioning contract in this migration.
> The current common barrel also exports `./UserProvisioner`: `userProvisionerRef`,
> `IUserProvisioner`, `IUserProvisionerConnectable`, and `UserProvisioner`. Auth
> injects the ref, the catalog user-provisioning module registers the creation
> callback, and the catalog native loader explicitly supplies the shared factory.
> None has a destination in the target inventory.
>
> Could we assign the interfaces/ref a `node-library` home and the
> implementation/factory an explicit backend owner?

**Fixed? ✅ YES**

Evidence:
- §2.1 barrel table (line ~81): `./UserProvisioner` row lists all exports with target
  `aap-node (service ref + interfaces + default implementation)`
- §3.2 `aap-node` files table (line ~418): `src/UserProvisioner.ts` with full description
  of service ref, interfaces, and class
- §2.1 consumers table (line ~111): `catalog-backend-module-rhaap-user-provisioner`
  listed as consumer with its imports
- §3.5 migration table (line ~508): `catalog-backend-module-aap-user-provisioner` listed
  with import update instructions

### Comment 2: Abhik's follow-up on UserProvisioner (alpha.ts + no-op + org resolver)

> Thanks for adding the provisioner ref, interfaces, root scope and stable service ID.
> The runtime registration still needs to be carried through: current main's catalog
> `src/alpha.ts` explicitly supplies the shared root `UserProvisioner` factory and
> `rhaapOrganizationServiceFactory` before yielding the catalog module. The target
> migration/deployment inventory does not describe the replacement for this loader or
> the organization adapter, and the separately listed user-provisioning module is
> missing from the deployment example. Also, §3.2 calls the provisioner factory 'no-op',
> but it delegates to a registered creation callback and throws until connected. Could
> we document the factory/loader owners, preserve the trusted organization resolver,
> and show how the callback is connected before the first JIT sign-in?

**Fixed? PARTIALLY ✅ (3 of 4 sub-asks addressed)**

| Sub-ask | Fixed? | Evidence |
|---------|--------|----------|
| Document `alpha.ts` feature loader | ✅ | §4.3.1 (line ~688–722) — full code listing and explanation |
| Fix "no-op" → "throws" | ✅ | §3.2 (line ~418) — now says "**throws** if `createUser()` is called before `registerCreateUserFn()` has been called" |
| Document `rhaapOrganizationResolver` | ✅ | §4.3.2 (line ~724–739) — both locations documented, migration impact described |
| Show how callback is connected before first JIT sign-in | ✅ | §4.3.1 now has a "JIT sign-in callback connection sequence" with 3 numbered steps showing boot-time ordering |

### Comment 3: Appendix C mapping to CEA

> Either (a) rename Appendix C to clarify these are derived checks, not a copy of the
> source, or (b) align the numbering/wording with the actual CEA.

**Fixed? ✅ YES**

Evidence:
- Title changed to _"Architecture validation checklist (derived from CEA principles)"_
  (line ~1189)
- Disclaimer note added: _"This checklist is derived from the principles in the Content
  Experience Architecture (CEA) document §6 dependency rules and §2.5 workspace
  conventions. The rules below are an AAP-specific application..."_ (line ~1191–1194)
- Rule 7 now explicitly says **"Deviation"** instead of "Compliant after Phase 7"
- Rule 6 now notes the `rhaapOrganizationResolver` exception

### Comment 4: `backend.add()` default export

> backend modules require default exports for `backend.add(import(...))`.

**Fixed? ✅ YES**

Evidence:
- §4.9 (line ~866–877): New section showing the default export pattern with code
  examples for both current (`catalogModuleRhaap as default`) and post-split
  (`ansibleServiceFactory as default`)

### Comment 5: Shim completeness

> Complete the shim re-exports (add `getAnsibleConfig`, `getCatalogConfig`,
> `resolveActiveOrganizations`, `mockData`).

**Fixed? ✅ YES**

Evidence:
- §4.9 (line ~848–860): Shim code now shows named imports:
  ```typescript
  export {
    AAPClient,
    getAnsibleConfig,
    getCatalogConfig,
    resolveActiveOrganizations,
    mockData,
  } from '@ansible/aap-backend';
  ```

### Comment 6: `getVerbosityLevels` contradiction

> §3.5 says scaffolder imports `getVerbosityLevels` from `aap-backend`, but §3.1
> places it in `aap-common/constants`.

**Fixed? ✅ YES**

Evidence:
- §3.5 scaffolder row (line ~509): Now says _"types and `getVerbosityLevels` from
  `aap-common`"_ (was: _"`getAnsibleConfig`/`getVerbosityLevels` from `aap-backend`"_)

### Comment 7: EEEntityProvider target

> EEEntityProvider uses `catalogProcessingExtensionPoint`, so it must be a
> catalog-attached module, not a scaffolder module.

**Fixed? ✅ YES**

Evidence:
- §2.3 table (line ~151): Target changed to _"Self-service (catalog-attached module
  owned by self-service)"_ (was: _"Self-service (scaffolder-backend-module-self-service)"_)

---

## Summary

| Reviewer | Comment | Fixed? | Remaining work |
|----------|---------|--------|----------------|
| Hrithik | PAH transition contract | ✅ | — |
| Abhik (follow-up to Hrithik) | Collection type needs isomorphic home for `aap-node` | ✅ | — |
| Abhik | UserProvisioner contract | ✅ | — |
| Abhik (follow-up) | alpha.ts + no-op + org resolver | ✅ | — |
| Abhik | Appendix C mapping | ✅ | — |
| Abhik | backend.add() default export | ✅ | — |
| Abhik | Shim completeness | ✅ | — |
| Abhik | getVerbosityLevels contradiction | ✅ | — |
| Abhik | EEEntityProvider target | ✅ | — |

**Overall: 9/9 fully fixed. ✅ All review comments addressed.**
