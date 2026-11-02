# Compliance Experience vs. Content Experience Architecture — Executive Summary

**Branch assessed:** `feature/aap-compliance-experience`
**Diff base:** `main` (`10b7c1f4`), 322 files changed, 240 of them under `workspaces/compliance/`
**Assessed against:**

- "Automation Content Management Framework: Architecture" (Ganesh's canonical doc, local copy)
- ANSTRAT-2497 Implementation Guide (`abhikdps/automation-portal-plugins@anstrat-2497-poc`)
- The actual, merged-to-`main` reference implementation: `workspaces/apme/plugins/backstage-apme`
  **Date:** 2026-11-02
  **Reviewer framing:** Staff Engineer review, architecture-conformance lens

---

## Bottom line

The branch does one job well — it ports a working, well-documented proof-of-concept
(`aap-compliance-pipelines`) into the monorepo with its tests, migrations, and 38 ADRs intact.
It does not do the job its own branch name promises. **`feature/aap-compliance-experience` does
not build an "experience."** It bolts a self-contained, legacy-shaped plugin onto the shell as a
top-level route and a hardcoded sidebar item, bypassing every mechanism the Content Experience
Architecture built for exactly this purpose.

That mechanism is not hypothetical or future work. It is merged to `main` today, in
`workspaces/apme/plugins/backstage-apme`, targeting the identical `content-quality-assessment`
experience that the canonical architecture names **APME** as the reference example for. Compliance
had a working sibling to copy and did not use it.

**Compliance conformance score: ~15%.** It gets credit for workspace layout, package roles, and
documentation discipline. It gets none for the extension contract, which is the part of the
architecture this branch's name claims to be about.

---

## What "compliant" would have looked like

APME already proves the pattern end to end, in this repo, for the same experience:

| Capability                                                                                       | APME (reference, merged)                                           | Compliance (this branch)                                                                                                                                       |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Declares a `PluginManifest`                                                                      | ✅ `apmeManifest.ts`                                               | ❌ none                                                                                                                                                        |
| Contributes to `EXPERIENCE_IDS.CONTENT_QUALITY`                                                  | ✅                                                                 | ❌ — owns `/compliance` as a standalone top-level route                                                                                                        |
| Mounted via capability entry points (tabs, cards, actions, columns)                              | ✅ `CatalogTableColumnBlueprint`, `EntityDetailTabBlueprint`, etc. | ❌ hand-rolled `ComplianceRouter` with hardcoded tabs                                                                                                          |
| Server effects via registered `OperationDescriptor` (id, schema, permission, audit, idempotency) | ✅ `apmeQualityScanOperation` et al.                               | ❌ plain Express routes, no operation registry, no audit category                                                                                              |
| Frontend SDK (`usePortalContext`, org/user from host)                                            | ✅                                                                 | ❌ not imported                                                                                                                                                |
| Backend SDK (`portal-plugin-node` identity middleware, audit emit, health push)                  | ✅                                                                 | ❌ not imported                                                                                                                                                |
| Database rows keyed by organization                                                              | ✅ (`withOrganization`)                                            | ❌ no `organizationId` anywhere in the schema                                                                                                                  |
| Extensibility for new content/variants                                                           | ✅ via host-owned `ExperienceSlot`                                 | ⚠️ **own parallel system** (ADR-027): arbitrary JS bundles loaded client-side, explicitly flagged in its own ADR as having "no formal plugin API contract yet" |
| Core app imports the plugin directly                                                             | ❌ (NFS discovers it)                                              | ❌ **violated** — `AppNfs.tsx` statically imports `compliancePlugin`                                                                                           |

The one open question that is _not_ a compliance failure: the architecture's four canonical
content types (`collection`, `execution-environment-definition`, `execution-environment-image`,
`playbook-repository`) don't cleanly describe compliance's actual subject — AAP-managed
**hosts and inventories**. That's a real gap in the architecture, not a shortcut the branch took.
It needs a decision (new content type, or a new host-owned experience alongside
`content-quality-assessment`), not a workaround.

---

## Why this matters now, not later

1. **It's the exact collision the architecture was written to prevent.** §1.3 of the canonical doc:
   _"Hardcoding a domain route into the core app is the thing the plugin factory exists to stop."_
   This branch does precisely that.
2. **ADR-027 (Dynamic Tab System) is a second, weaker extension mechanism being built next to the
   real one**, in the same repo, in the same sprint cycle as APME's. It ships with a documented
   security caveat (arbitrary JS execution with full React context) that `portal-extension-host`
   was explicitly designed to avoid (scoped manifests, error boundaries, permission gating).
3. **The cost of retrofitting grows every sprint this ships as-is.** Every new compliance feature
   built against `ComplianceRouter`'s tab model is a feature that has to be re-expressed as a
   `CapabilityContribution` later, plus a route-compatibility shim for existing bookmarks/links.
4. **There is no reason to design this from scratch.** APME solved the identical problem
   (scan + remediate + settings + lifecycle, gated by entitlement and permission, contributed into
   Content Quality) three months ago, in the same monorepo. This is a copy-the-pattern job, not a
   research job.

---

## Recommendation

Do not ship `feature/aap-compliance-experience` as a new standalone plugin. Re-scope it as a
capability contribution, using `backstage-apme` as the template, before this branch grows further
or ships to users with the hardcoded-route shape baked in.

A detailed, file-by-file gap document — organized so it can seed a Cursor implementation
plan — is at
[`detailed-gap-analysis.md`](./detailed-gap-analysis.md) in this same directory.

**Suggested sequencing**, pending the one open design question (content type vs. new experience
for host/inventory compliance):

1. Resolve the content-type/experience question with the architecture owner (Ganesh) and the
   ANSTRAT-1758 content team — this blocks everything else and is a half-day design conversation,
   not an implementation task.
2. Introduce `complianceManifest.ts` + register the existing dashboard tabs as
   `CapabilityContribution`s against whichever experience is agreed, mirroring `apmeManifest.ts`.
3. Replace the `AppNfs.tsx` static import and standalone `PageBlueprint` with NFS slot-based
   blueprints (`EntityDetailTabBlueprint`, `CatalogTabBlueprint`, etc.), keeping `/compliance/*`
   working via redirects per the architecture's compatibility constraint (§7.7).
4. Wire `compliance-backend` through `portal-plugin-node` (identity middleware, audit emit, health
   push) and key the schema by `organizationId`.
5. Re-express the backend routes compliance already has as registered `OperationDescriptor`s
   (schema, permission, audit category, idempotency) instead of plain Express handlers.
6. Decide the fate of ADR-027's Tier 2 bundle loading: either retire it in favor of host-owned
   slots, or write a new ADR justifying why it needs to remain a parallel mechanism — "it already
   works" is not that justification on its own.

None of this blocks fixing the pre-existing lint debt already in flight on this branch; that work
can continue in parallel and should land before any of the above, since it touches the same files.
