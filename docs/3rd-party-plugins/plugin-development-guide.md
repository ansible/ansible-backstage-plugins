# Plugin Development Guide

**Status:** specified — ANSTRAT-2497, Portal Plugin Factory (guide and SDK specification). This Feature does not implement host APIs, a scaffold CLI, reusable CI, or packaging automation.
**Binding ADRs:** [010](../adrs/common/010-plugin-factory-composability.md)–[013](../adrs/common/013-plugin-factory-enablement-defaults.md), [015](../adrs/common/015-plugin-factory-catalog-first-surfaces.md)–[019](../adrs/common/019-plugin-factory-delivery-lifecycle.md), plus [ADR-028](../adrs/third-party/028-out-of-tree-plugin-obligations.md) for out-of-tree plugins.

Content Experience Architecture and UI Composability Architecture are **not published in this docs tree**. This guide states the author-facing rules from those documents; do not invent private substitutes for unpublished diagrams.

Honesty tags:

| Tag | Means |
| --- | --- |
| **shipped** | Authors can do this against current Portal/RHDH behavior |
| **specified** | Target contract; describe it; do not invent a private substitute |
| **not yet** | Unanswered mechanism; fail closed; do not guess YAML, pipelines, or owners |

## How this guide should work

**Audience.** Engineers on a BU-approved product team authoring a third-party Portal plugin in **their own repository**. Third-party means not part of the Automation Portal base plugins. Partner and broader RHDH ecosystem plugins are out of scope unless the BU explicitly approves them.

**Designed path.** The agent is the primary author. A human describes the capability (user goal, subjects, operations, who owns the data) and reviews what the agent produces. A contributing team should not need to contact Portal engineering unless they are requesting a **host contract change**: a new Experience, a new Blueprint family, a new semantic region, or a new host API version.

**Docs are skills, skills are docs.** The intended deliverable is one `SKILL.md` that is both the human guide and the agent procedure. That skill is **not yet** published in this repository. This page is the canonical author-facing text until the skill ships. Optional `reference.md` for worked examples. Eval cases so the walkthrough cannot drift from the ADRs. If a second docs copy ships, it must be generated from or identical to the skill — not a second narrative.

Suggested contributor-kit shape (names can change; install mechanism is **not yet**):

| Artifact | Role |
| --- | --- |
| Onboarding skill (`SKILL.md`) | Walkthrough + the guide. Entry point. |
| Contract skill | Hard rules: manifest, operations, NFS, applicability, anti-patterns |
| `portal-design` | Visual and content standards; onboarding defers UI craft here. Not published in this repository yet. |
| ADRs 010–019 plus factory ADRs including [ADR-028](../adrs/third-party/028-out-of-tree-plugin-obligations.md) | Binding decisions the skills cite; never restated as optional style |
| SDK TypeScript types / package map | What code compiles against, status-tagged |

```text
human describes capability
        |
        v
onboarding skill (same file humans read)
        |
        +-- classify: template vs plugin vs extend existing
        +-- Portal delta vs stock RHDH
        +-- Experience vs plugin vs capability vs content type
        +-- frontend / backend / neither
        +-- abstract Blueprint locations (not a screenshot)
        +-- BUI → PatternFly → custom
        +-- manifest + NFS + operations (never URLs)
        +-- lifecycle evidence
        |
        v
valid contribution  OR  fail closed / escalate (host-contract only)
```

## 1. Engine primer

Portal is not a greenfield app. It runs on **Red Hat Developer Hub**, Red Hat’s supported distribution of **Backstage**. A Portal plugin is a Backstage plugin. That is the start of the story, not the end.

**Stack.**

- **Backstage** — React frontend and Node.js backend, plugin-driven.
- **RHDH** — enterprise Backstage; dynamic plugins and the New Frontend System (NFS).
- **Automation Portal** — an RHDH product with a **host contract**: Experiences, entitlement-filtered create, registered operations, BUI, AAP RBAC.

Authors write a Backstage plugin **against the published Portal SDK**, not a generic RHDH plugin that assumes stock `/create`, plugin-owned navigation, or arbitrary REST.

**What to take from Backstage/RHDH.**

- Frontend: React and TypeScript.
- Backend: a Backstage backend plugin or module.
- Out-of-tree load path: RHDH **dynamic plugins**. Do not fork the Portal codebase. Portal SDK packages are **shared singletons** (see §3 and §7); a stock dynamic plugin that embeds its own copy of the registry will not compose.
- Catalog entities exist. Prefer catalog- and entity-scoped surfaces ([ADR-015](../adrs/common/015-plugin-factory-catalog-first-surfaces.md)).
- Scaffolder **field extensions** and **actions** are two real host surfaces. They are not the whole product.

**What not to teach here.**

- Scaffolder as “the heart of the product.” It is one host surface beside catalog, quality, migration, settings, and authoring.
- Portal as “Job Template wizard → AAP Job API.” That is one self-service path, not the plugin contract.
- Catalog YAML as source of truth. The catalog is a **projection**.
- Three extension points (field, action, card) as the complete surface. Abstract Blueprint locations also include tabs, catalog columns, provenance, experience work areas, settings, and workflow launchers.
- Click-to-install / always-edit-`dynamic-plugins.yaml` as the production model. First-party plugins ship in the product image. Exact third-party packaging is **not yet**.
- A specific export CLI package name. Say “RHDH dynamic-plugin export.” Do not freeze a toolchain name in this guide.

Read the primer, then the delta checklist. Do not stop after “you are writing a Backstage plugin.”

## 2. Am I in the right place?

### 2.1 Definition

A third-party Portal plugin is a BU-approved product-team plugin that is not a base Portal plugin. It lives in **another repository**. It consumes the published SDK and contributor kit. It is not authored inside this repository.

### 2.2 Delivery vehicle ([ADR-016](../adrs/common/016-plugin-factory-template-vs-plugin.md))

```text
Is the user job mostly one-shot create / launch / provision (form → run → done)?
  YES → Software template (self-service / scaffolder).
        Skip the Feature → EAP → Preview → GA *plugin* path
        unless you also need persistent UI or custom fields/actions.
  NO  → Ongoing workspace (cards, tabs, settings, dashboards, catalog columns)?
          YES → Factory Backstage plugin (or extend an existing host surface).
          NO  → Can it be a small addition to catalog / self-service?
                  YES → Extend existing host first ([ADR-010], [ADR-015]).
                  NO  → Revisit scope; do not invent a third path.
```

See [ADR-010](../adrs/common/010-plugin-factory-composability.md) and [ADR-015](../adrs/common/015-plugin-factory-catalog-first-surfaces.md).

Software templates are **not** a skip of onboarding. Authors still need the walkthrough for templates, field extensions, scaffolder actions, entitlement-filtered discovery, and the Portal-vs-RHDH create-wizard delta.

A one-shot conversion wizard is a software template. Plugin-owned scaffolder field widgets contribute to the **host scaffolder surface**. Do not send that work down the full Experience/Blueprint factory path unless persistent UI is also required.

### 2.3 Intake

Intake is the existing factory **Propose / Review** path in ADRs 010–019: template vs plugin, catalog-first placement, config namespace, Preview labeling, enablement defaults, lifecycle stage. Decision gates exist. A published named-role RACI for other BUs is still thin — say that. Do not invent owners or an approval workflow.

**Escalate to Portal engineering only for** a new Experience, Blueprint family, semantic region, or host API version. Placement inside an existing Experience is host policy, not an authoring question.

Worked examples stay generic: a quality contribution (one capability, several Blueprints, scoped content types); a conversion-style template (software template plus plugin-owned scaffolder fields).

## 3. What Portal requires above a regular RHDH plugin

A valid RHDH dynamic plugin is **necessary and not sufficient**. If an author says “we already have an RHDH plugin,” map this table first. Do not treat Backstage APIs as done.

| Stock RHDH plugin | Additional Portal obligation | Status |
| --- | --- | --- |
| Own pages, sidebar, routes | Contribute to **host-owned Experiences** via abstract Blueprint locations. Do not author the information architecture. | specified |
| Legacy slots / `moduleName` / inject a card | Static **NFS** plus a matching **manifest**. The host composes placement. | specified |
| Call a backend URL or proxy | **Registered operations** (schemas, permissions, audit). Same operation for UI, REST, MCP, and Scaffolder. No `apiEndpoint` or `handlerPath`. | specified |
| Stock Scaffolder `/create` | Entitlement-filtered **Portal create wizard**. Field extensions merge into the host registry. Do not send users to `/create`. | specified (merge may be not yet shipped) |
| Generic RJSF / MUI | **BUI → PatternFly → custom** (documented reason). Host owns loading, empty, restricted, and error chrome. | specified |
| Catalog YAML as the data model | Catalog is a **projection**. Domain state lives in the plugin backend, keyed by organization. | specified |
| Ad hoc feature flags | `ansible.<pluginId>.*` and **zero footprint** when disabled ([ADR-010](../adrs/common/010-plugin-factory-composability.md), [ADR-011](../adrs/common/011-plugin-factory-config-namespace.md)). | shipped as policy; SDK readers specified |
| Community Preview conventions | EAP / Tech Preview / GA and Preview chip rules ([ADR-012](../adrs/common/012-plugin-factory-preview-labeling.md), [ADR-013](../adrs/common/013-plugin-factory-enablement-defaults.md), [ADR-017](../adrs/common/017-plugin-factory-preview-chip-placement.md), [ADR-019](../adrs/common/019-plugin-factory-delivery-lifecycle.md)). | shipped as policy |
| Compile against Backstage packages | Compile against the **published Portal SDK** and `apiVersion`. Contributor kit (ADRs and skills) used from the third-party repo. Consume **published versions**, not `workspace:^`. | specified |
| Each dynamic plugin bundles its own copy of helpers | `portal-extension-api` (and related SDK packages) are **Module Federation singletons**. Declare them `peerDependency`; never `--embed-package`. Host `portal-core` must load first. Two registry copies means contributions never appear. | specified |
| Admin loads `dynamic-plugins.yaml` | Out-of-tree, no fork. Exact packaging and CI are **not yet**. Fail closed; do not invent. | not yet |

Several rows are specified and not yet shipped (field-registry merge, SDK packages). The section still states the delta so authors do not ship a stock RHDH plugin and call it a Portal plugin.

## 4. Mental model

Three things people mix up. Refuse conflation.

| Term | Meaning | Owner |
| --- | --- | --- |
| **Content type** | What the artifact is (collection, execution environment, playbook repository, …) | Content contract |
| **Experience** | Host-owned user goal (for example Content Quality, Content Authoring, Content Migration) | Host + UX |
| **Plugin / capability** | A contribution into one or more Experiences, scoped to the content types it actually supports | Plugin |

A page, card, tab, or screenshot is a **realization** of an Experience, not the Experience. Several plugins can contribute to one Experience. One plugin can contribute to several.

**UI composability.** Authors pick an **abstract Blueprint location** (entity overview, entity action, table column, workflow launcher, scaffolder field, …). The host binds it to a concrete Experience. `recommendedExperienceId` is advisory only.

Realization patterns and the plugin manifest / operations model live in architecture research that is not published in this docs tree. Follow the rules in this guide and the binding ADRs; do not invent a parallel model.

## 5. Which packages are needed?

```text
Is the user job one-shot create / launch / provision (form → run → done)?
  YES → Software template. No new plugin unless you also need custom fields or a custom scaffolder action.
        Custom field widget only → frontend plugin (field extension) + template.
        Custom scaffolder action or server mutation → backend module as well.
  NO  → Persistent UI (card, tab, action, settings, catalog column, workflow launcher)?
          YES → Frontend plugin (NFS contributions). Add *-common for contracts.
          Need persistence, registered operations, catalog providers, or MCP-exposed mutations?
            YES → Backend plugin/module too. Host is stateless; plugin DB is org-keyed.
            NO  → Frontend + common only. Do not invent a backend “for completeness.”
          NO  → Revisit: extend an existing host surface or stop.
```

**Author vs host packages** (from the portal-core layout; **specified**).

| Your plugin depends on | You do not depend on |
| --- | --- |
| `portal-extension-common` — serialisable vocabulary, no React, no Node | `portal-extension-host` — renders contributions |
| `portal-extension-api` — frontend registration (peerDependency, singleton) | `portal-core` — RHDH Module Federation glue; must load first |
| `portal-plugin-sdk` — `usePortalContext()`, tokens, shared UI | `portal-health-backend` — host health aggregation |
| `portal-plugin-node` — backend factory, identity, health, audit | Host page packages |

`portal-extension-common` is the dictionary both halves share. Frontend types and hooks stay in `portal-extension-api`. Backend runtime stays in `portal-plugin-node`. Do not put `OperationDescriptor` in a React package.

An in-tree first-party workspace can demonstrate compile-time isolation (guest does not import host pages). That is **not** how third-party authors work: they do not add a workspace to this repository.

**Refuse.**

- A frontend that calls an arbitrary URL instead of a registered operation or scaffolder action
- A backend that is a generic HTTP proxy
- A backend plugin with no operation, provider, or persistence job
- A frontend plugin whose only purpose is a new Experience or a private page the host does not own
- Patching a Portal package to register a third-party field or route
- Depending on `portal-extension-host` or `portal-core` from a third-party plugin
- `workspace:^` on SDK packages from an out-of-tree repo
- Bundling (`--embed-package`) `portal-extension-api` into the guest

`*-common` is required once there is more than one artifact: API refs, config reader, shared types.

## 6. Declare, do not compose

**The plugin declares.**

- Capability and information it provides
- Abstract Blueprint family
- Content types (and optional source kinds) it supports
- Operations, permissions, entitlements
- NFS implementation (`alpha.ts` / `alpha.tsx`) matching the manifest
- Optional advisory `recommendedExperienceId`
- Optional runtime predicate that may **narrow** applicability

**The plugin does not own.**

- Which Experience receives the contribution
- DOM structure, CSS selectors, private slot names
- A route or URL as the host contract
- Layout, ordering, responsive behavior
- Loading, empty, restricted, and error chrome

**Honesty.** ANSTRAT-2497 may describe target APIs before host code exists. **Fail closed**. Do not invent `apiEndpoint`, `handlerPath`, plugin-named Blueprints, or content-type-named Blueprints.

**PoC vs architecture.** Early portal-core types required `experienceId` on the capability and used page-frozen registration helpers such as `registerGitRepoDetailTab`. The published contract is an abstract Blueprint family plus advisory `recommendedExperienceId`; the host binds. Do not teach required Experience binding or `register<HostPage>Tab()` helpers as the author API. `SlotLaunch.moduleName` is legacy; NFS is the target.

## 7. SDK surface

ANSTRAT-2497 **publishes the specification**. Follow-on Features implement packages. Until then, document the compile-against map as **specified**. Do not claim this Feature ships the npm packages.

### 7.1 Compile-against map

| Package | Role | Who uses it |
| --- | --- | --- |
| `portal-extension-common` | Serialisable `PluginManifest`, capabilities, entitlements, `OperationDescriptor`. No React, no Node. | Frontend and backend |
| `portal-extension-api` | Frontend registration, shared `ContributionRegistry`. **PeerDependency / MF singleton.** | Frontend only |
| `portal-plugin-sdk` | `usePortalContext()`, BUI/tokens, RJSF widget registration, shared UI | Frontend only |
| `portal-plugin-node` | `createPortalPlugin()`, identity middleware, `pushHealthStatus()`, `emitAuditEvent()`, org-keyed DB helpers | Backend only |
| Host `apiVersion` | Compatibility the plugin declares and the host validates | Manifest |

Host-only (authors do not depend): `portal-extension-host`, `portal-core`, `portal-health-backend`.

### 7.2 Frontend verbs

- `usePortalContext()` — `organizationId`, user, loading. Never take tenant identity from plugin input as proof.
- Host wraps every contribution: error boundary, Suspense, CSS tokens (`--portal-color-*` from the active theme). Authors use the tokens for color; they do not import MUI solely to read the palette. This sits **under** BUI → PatternFly → custom, not instead of it.
- Host owns `SettingsShell` (RJSF). Plugin supplies schema, `onLoad` / `onSave`, persistence.
- Dynamic frontend entry (today `dynamic/index.ts`; target NFS `alpha.ts`) is **side-effect-only**: register contributions, do not fetch data or mount trees at load.

### 7.3 Backend verbs

- `createPortalPlugin({ pluginId })` then middleware so `organizationId` is unavoidable on the request.
- `pushHealthStatus()` — health is **push**, not a URL the host scrapes.
- `emitAuditEvent()` on operations.
- Org-keyed queries only. A query without organization is a bug.

A bad or incompatible manifest **fails locally**. It does not prevent the portal from starting.

### 7.4 Launches

An entry point connects with a discriminated launch. No handler URL.

| Type | Means |
| --- | --- |
| `operation` | Invoke a registered backend operation (`operationId`). Optional `followOn` to a slot or workflow after dispatch. |
| `workflow` | Start a host-owned guided walkthrough (`workflowId`). Plugin does not supply a URL. |
| `slot` | Mount a contribution in a host-owned semantic region. Target NFS, not `moduleName`. |

`scaffolder-field` is a first-class entry-point kind in the manifest types, alongside entity tab, entity action, catalog item action, overview card, table column, settings section, and others. The host still owns placement.

### 7.5 Minimum integration areas

- Manifest and NFS match. Neither may widen permissions, scope, or identifiers the other does not declare.
- Registered operations, not URLs, for UI, REST, MCP, and Scaffolder.
- Settings: host RJSF shell; plugin owns schema, validation, and persistence.
- RBAC and entitlements; organization-keyed plugin database; host is stateless across tenants.
- Config namespace `ansible.<pluginId>.*` ([ADR-011](../adrs/common/011-plugin-factory-config-namespace.md)).
- Zero footprint when `ansible.<pluginId>.enabled` is false ([ADR-010](../adrs/common/010-plugin-factory-composability.md)).

If asked for a sample that uses a handler URL, `workspace:^`, `--embed-package` on the registry, `register<HostPage>Tab()`, or a required `experienceId` as the contribution’s identity, refuse. Developers copy examples.

## 8. UI

### 8.1 Component decision tree

Binding for authors and agents:

```text
1. BUI (Backstage UI) — default. Use BUI components, tokens, and Blueprint-backed
   patterns the host already standardizes (RHDH 2.1+).
2. PatternFly — only when BUI has no equivalent and the interaction is a PF pattern.
   Consume through the Portal/RHDH PF path, not a one-off PF import that bypasses
   host tokens.
3. Custom — only with a documented reason at Propose/Review: no BUI or PF pattern
   fits, and the control is plugin-domain (not a second card chrome, empty state,
   or status chip).
```

[ADR-018](../adrs/common/018-plugin-factory-shared-ui-primitives.md) (reuse over custom) and `portal-design` sit under this tree. Today’s `portal-design` skill still describes Material-UI adapted to PatternFly 6 and is not published here. The author-facing default for ANSTRAT-2497 is **BUI first**. Aligning that skill is follow-on.

### 8.2 Blueprints and regions

Use abstract Blueprint locations as the authoring vocabulary (entity overview, entity action, table column, workflow launcher, scaffolder field, and the rest of the host catalog). Attachment regions are host-owned semantic contracts, not DOM locations. A plugin cannot invent a private region.

Honest states are required: loading, empty, restricted, stale, `unknown`, `not_scanned`, `partial`, `failed`. Scores and statuses need evidence or a drill-down path.

Operations are separate from presentation. The same scan can be a card, a catalog action, and an MCP tool.

Host-injected `--portal-color-*` tokens (surface, text, status, primary) keep contributed UI theme-adaptive without an MUI `useTheme()` import. They are not a license to skip BUI or PatternFly when those already have the control.

## 9. Scaffolder field registry

The Portal create wizard must be a **generic superset of the stock RHDH scaffolder field registry**. Third-party plugins register `scaffolderFieldExtensions` and scaffolder actions against that published surface. They do not patch host UI.

**Specified** host behavior (may be **not yet** shipped):

- Merge every dynamically registered field extension into the RJSF fields map. On name clash, Portal-owned entries win.
- A `ui:field` on a property inside `dependencies` / `allOf` / `if/then` still binds. Default-stripping must not drop nested uiSchema.
- If a merged field uses `requestUserCredentials` / ScmAuth, the wizard wraps the form in the scaffolder secrets context.
- AAP RBAC template filtering stays. Do not route users to stock `/create`.

Two field models, both valid:

| Model | Who owns the widget | Contract |
| --- | --- | --- |
| Host-owned field | Host | Calls a registered operation or typed client |
| Plugin-owned field | Third-party plugin | Dynamic `scaffolderFieldExtensions` merged into the wizard |

Keep the “no arbitrary URL in the template” rule for both.

Today’s hardcoded field list in the create-wizard implementation is **current code location**, not a factory ownership decision. The author-facing contract is the host field registry. Which package implements the merge is follow-on platform work. ANSTRAT-2497 specifies the obligation; it does not assign a delivering team.

If asked “register field extensions like RHDH and they appear on Portal,” answer with this contract and tag **host-missing** until the merge ships. Do not tell a third-party team to hardcode a widget into any Portal package.

**Refuse.**

- “Just use `/create`” (bypasses entitlement filtering)
- “Add your widget to the host field list” (per-plugin hardcoding)
- One-off host wiring for a single contributor
- A credential-minting URL on the plugin instead of scaffolder secrets context
- Copying in-tree `dynamic-plugins.yaml` / `janus-cli` snippets as the third-party publish path (packaging is **not yet**)

A template that works on stock RHDH and fails on Portal is a **host wizard gap**, not author error. Out-of-tree plugins are gated on host `apiVersion`, not on a Portal pull request from the contributing team.

## 10. Lifecycle, packaging, and CI

Do not leave these sections blank. A blank heading is worse than an unanswered one: an agent will invent a pipeline.

### 10.1 Known now (binding)

- Third-party plugins live in **other repositories**. See [ADR-028](../adrs/third-party/028-out-of-tree-plugin-obligations.md).
- Runtime `PluginManifest` and install `portal-plugin.yaml` are two jobs. Mixing them is a refusal.
- EAP / Tech Preview / GA still apply ([ADR-019](../adrs/common/019-plugin-factory-delivery-lifecycle.md), [ADR-013](../adrs/common/013-plugin-factory-enablement-defaults.md)). Preview chips: [ADR-012](../adrs/common/012-plugin-factory-preview-labeling.md), [ADR-017](../adrs/common/017-plugin-factory-preview-chip-placement.md).
- Adding a plugin today still touches installer lists the author does not own. Record that as a factory gap. Do not tell authors to open a Portal pull request to edit installer code.

### 10.2 Packaging — not yet

Unanswered: OCI export layout, registry path, integrity hashes, and how an out-of-tree image enters the product catalog index, operator, or appliance. Whether EAP delivery is a welcome pack, overlay, or something else for out-of-tree artifacts is also unanswered ([ADR-019](../adrs/common/019-plugin-factory-delivery-lifecycle.md) names those as examples, not the third-party procedure).

If asked how to publish or where the tarball goes: state the repo-boundary rule and these open questions. Do not invent a Containerfile, build pipeline, or `dynamic-plugins.yaml` snippet for a third-party repo.

### 10.3 CI and test — not yet

Reusable workflows and a shared test harness are out of scope for ANSTRAT-2497. Still list **obligations** the eventual workflows must enforce:

- Zero footprint when disabled
- No `apiEndpoint` / `handlerPath`
- Manifest/NFS congruence
- Predicates do not broaden declared content-type scope
- Honest UI states; operations registered, not proxied
- Eval cases for the onboarding skill itself

Author-owned tests in the third-party repo are expected in principle (unit, contract, UI against the published SDK). The harness, shared workflows, and how Portal CI consumes out-of-tree plugins are factory follow-on.

If asked for “the official workflow YAML,” refuse and tag **host-missing**. Do not copy Portal monorepo CI into the third-party repo as if it were the SDK.

### 10.4 Contributor kit — not yet (mechanism)

Requirement: ADRs and skills are consumable from a plugin repo **without** cloning the Portal repositories. Direction, not a chosen mechanism:

- A small versioned contributor-kit (skills + ADR subset + SDK types), not the whole Portal repo
- Pinned to host `apiVersion`
- Install mechanism (`npx skills add`, submodule, or package) is **not yet**
- `portal-design` remains a dependency of the onboarding skill, not duplicated

Kit distribution is separate from plugin-artifact packaging. Publishing these ADRs in this repository is a start; it is not the full kit.

## 11. Walkthrough

When asked to onboard a plugin or add a contribution:

1. Intake: user goal, subjects, persistence, one-shot vs ongoing UI.
2. Classify delivery vehicle, including the template + field-extension branch. Then frontend vs backend vs both (§5).
3. Map the Portal-vs-RHDH delta (§3).
4. Template path: declare scaffolder action and field extensions. Do not invent a Portal page or patch host field lists.
5. Plugin path: select Blueprint families and content-type scope; draft capability and operation descriptors; draft UI against abstract locations using **BUI → PatternFly → custom**. Declare SDK packages as peerDependencies (singleton). Do not depend on host packages.
6. Check anti-patterns (scaffolder refusals in §9, SDK refusals in §7, and the invariant list in §12).
7. List evidence required for the current lifecycle stage.
8. Stop with a gap list tagged **host-missing** vs **author-todo**.

**Generic worked examples.**

- Quality assessment: one capability; overview card, detail tab, and entity action; scoped to the content types the scanner actually supports.
- Conversion-style template: software template plus plugin-owned scaffolder fields; host field registry; entitlement-filtered wizard; no `/create`.

## 12. Safeguards: ADRs and invariants

Cite ADRs. Do not paraphrase them into optional style. Rules that exist only in unpublished research are listed as **ADR candidates**, not buried as soft guide advice.

**ADRs 010–019 are binding for third-party plugins** even though those plugins live in other repos. Composability, config namespace, Preview, enablement, catalog-first placement, template-vs-plugin, shared UI primitives, and delivery lifecycle apply. [ADR-028](../adrs/third-party/028-out-of-tree-plugin-obligations.md) adds the out-of-tree deltas.

**Monorepo-location clauses to amend later** (do not treat these as “in-tree only”):

| ADR | Clause that assumes this repository |
| --- | --- |
| [ADR-010](../adrs/common/010-plugin-factory-composability.md) | Scope text: plugins in `ansible-backstage-plugins`; `packages/app` as composition root |
| [ADR-011](../adrs/common/011-plugin-factory-config-namespace.md) | Product teams contribute plugins in `ansible-backstage-plugins`; upstream `packages/app` wiring |
| [ADR-016](../adrs/common/016-plugin-factory-template-vs-plugin.md) | Factory plugin path `ansible-backstage-plugins/plugins/backstage-<pluginId>` |
| [ADR-018](../adrs/common/018-plugin-factory-shared-ui-primitives.md) | No static UI in `packages/app`; do not refactor `ansible-backstage-plugins` |

The rules (no cross-plugin implementation deps, config namespace, reuse over custom, template vs plugin) still apply out of tree. Only the repo-location sentences need a later amendment.

**ADR / invariant candidates** (list only):

- Experience is host-owned; plugins cannot create or authoritatively bind Experiences
- Operations, not URLs (forbid `apiEndpoint` / `handlerPath` in manifests and examples)
- Manifest/NFS congruence; neither widens permissions or scope
- No plugin-named or content-type-named Blueprint families
- Predicate may narrow, never broaden, declared content-type scope
- Plugin state keyed by organization; host stores no plugin domain rows
- Contributor kit versioned with `apiVersion`; skills fail if kit and host contract disagree
- Portal create wizard is a generic RHDH field registry; third-party plugins do not patch it
- `portal-extension-api` is a Module Federation singleton; guests must not embed it
- Third-party plugins do not depend on `portal-extension-host` or `portal-core`
- Health is push (`pushHealthStatus`); the host does not scrape a plugin URL
- Invalid manifest fails closed locally; it does not take down the portal

Eval cases on the onboarding skill must refuse a plugin-owned Experience page, a proxy URL, stock `/create`, or a custom empty state when BUI already has one.

## 13. Factory backlog this guide is allowed to specify

ANSTRAT-2497 is out of scope to **implement**. The guide may still name these as host obligations:

- Host registry, settings registration, RBAC registration, navigation slots, persistence APIs
- Published SDK npm packages
- Generic scaffolder field-extension merge, nested `ui:field` binding, secrets context on the wizard
- Scaffold CLI, reusable CI gate, welcome-pack automation
- Contributor-kit distribution mechanism
- Out-of-tree packaging into the product catalog / operator / appliance
- Amending ADR 010–019 monorepo-location clauses
- Aligning `portal-design` to BUI-first
- Resolving PoC `experienceId`-required / `register<HostPage>Tab()` helpers to the Blueprint + advisory-recommendation model
- Resolving `SlotLaunch.moduleName` to NFS
- Published (not `workspace:^`) SDK versions for out-of-tree consumers

## See also

- [Third-party plugins overview](index.md)
- [ADR index](../adrs/index.md)
- [ADR-028: Out-of-Tree Plugin Obligations](../adrs/third-party/028-out-of-tree-plugin-obligations.md)
