# ADR-027: Catalog Entity Naming and Namespaces

**Audience:** `common` — see [ADR index](../index.md).

- **Status**: Accepted
- **Date**: 2026-09-18
- **Updated**: 2026-09-24
- **Deciders**: Portal team (ANSTRAT-912 discussions 2026-09-18 and 2026-09-22)
- **Partially supersedes**: ADR-020 entity naming and namespace assignment when `multiOrgEnabled` is on (`{source}-{type}-{id}` names + `{source}-{org-id}` namespaces + `{source}-user-{id}`); flag off keeps ADR-020-style slug names and raw usernames in `default`; users / `aap-admins` stay in `default` and config-time collision validation remain
- **Research**: 013 — Catalog Entity Naming and Namespace Proposals (research not published in this repository)
- **Jira**: [AAP-93499](https://redhat.atlassian.net/browse/AAP-93499), spike [AAP-93500](https://redhat.atlassian.net/browse/AAP-93500), ADR [AAP-93501](https://redhat.atlassian.net/browse/AAP-93501), implement [AAP-93502](https://redhat.atlassian.net/browse/AAP-93502)
- **Meetings**: ANSTRAT-912 discussions 2026-09-18 and 2026-09-22 (internal notes not published)

## Context

ADR-020 isolated multi-org catalog entities with Backstage namespaces and assumed **slug-only** entity names (`group:default/engineering`). AAP-91915 unified three incompatible AAP→Backstage sanitizers. Remaining gaps:

- Different AAP resources collapse to the same slug (case-only JT names; org vs team with the same name)
- AAP usernames with `@` / `+` are valid in AAP but not as Backstage `metadata.name`; aggressive normalize of `.` / `_` → `-` is **not injective** (`ops_admin` ≡ `ops-admin`)
- Bootc and operator Day 0 sanitizers drift from the plugin slug rules
- Future multi-source sync (`aap` / `ao` / `scm`) needs an explicit per-provider identity matrix
- Catalog kind model stays Backstage-standard (`Group` / `User` / `Template`) — no custom `Organisation` / `Team` kinds (Groups already model org/team membership for ownership and RBAC)

Display must stay human-readable and follows the conventions in §2. Only machine identity (`metadata.name` and entity refs) is gated by `multiOrgEnabled`; display conventions apply in both modes.

Single-org upgrades (`multiOrgEnabled: false`) must not change entity **names** or **namespaces** for org-scoped resources — refs stay slug-based in `default`. Enabling the flag is the explicit break for org/team/JT/WFT naming and namespaces.

## Alternatives Considered

| Alternative                                               | Why rejected / deferred                                                                                   |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Keep slug-only names; namespaces only (ADR-020 as-is)     | Does not fix org↔team or case-only collisions inside one namespace                                        |
| Prefixed names **with** slug + id (`o-aap-{slug}-{id}`)   | Inconsistent type token placement; needs fallback when slug is empty; longer names                        |
| English synonym replacements (`&` → `-and-`)              | Semantic conversion; `R&D` vs `R-and-D` collide or confuse                                                |
| One-time catalog migration job for stale entities         | Unnecessary — scheduled providers use `applyMutation({ type: 'full' })`                                   |
| Proposal A always (`aap-{slug}` even in single-org)       | Breaking namespace change for every single-org upgrade                                                    |
| Proposal B multi-org slug-only (`engineering`, no source) | Weaker multi-source readiness; superseded for multi-org                                                   |
| Flag-on namespace `{source}-{org-slug}`                   | Collides on case/punctuation/rename/truncation; superseded by `{source}-{org-id}`                         |
| `{source}-user-{username}` (e.g. `aap-user-alice`)        | Still case-folds; non-injective; forces auth/OR updates without fixing collisions                         |
| Silent username sanitize (`.`/`_` → `-`) as identity      | **Rejected** — `ops_admin`/`ops-admin` collide; can map login onto wrong User (e.g. inherit `aap-admins`) |
| Custom kinds (`Organisation`, `Team`, `JobTemplate`)      | Reimplements Group/Template ownership, memberOf, scaffolder, and RBAC; no collision benefit               |
| `{source}-user-{id}` always (even flag off)               | Breaks every single-org user ref / auth path on upgrade                                                   |
| `{source}-user-{id}` in this ADR without auth migration   | Half-migration breaks login; must ship with auth under the same flag (AAP-93502)                          |

## Decision

### 1. Entity naming — hybrid via `multiOrgEnabled`

Source `{source}` is `aap` | `ao` | `scm`. Default for AAP-synced entities is `aap`. IDs are unique **within one AAP controller (source instance)**. Multi-controller Portal is out of scope; a future controller key would extend `{source}` or the namespace prefix.

| Mode     | Org / team / JT / WFT `metadata.name`                      | Example (team id 12, slug `deploy-team`) |
| -------- | ---------------------------------------------------------- | ---------------------------------------- |
| Flag off | **Slug** (today’s sanitizer) — **no break for single-org** | `deploy-team`                            |
| Flag on  | `{source}-{type}-{id}` — no slug, no 63-char fallback      | `aap-team-12`                            |

Type tokens when the flag is on:

| Kind              | Type token | Pattern (flag on)    | Example        |
| ----------------- | ---------- | -------------------- | -------------- |
| Organization      | `org`      | `{source}-org-{id}`  | `aap-org-1`    |
| Team              | `team`     | `{source}-team-{id}` | `aap-team-12`  |
| Job template      | `jt`       | `{source}-jt-{id}`   | `aap-jt-5238`  |
| Workflow template | `wft`      | `{source}-wft-{id}`  | `aap-wft-9001` |

Users — see §1.1 (**flag-gated**, same hybrid as org/team/JT).

Do not parse identity out of `metadata.name`; use annotations (`ansible.com/aap-org-id`, `aap-team-id`, `aapJobTemplateId`, `aap-username`, `aap-user-id` when flag on).

**Shared builders (mandatory):** `metadata.name`, namespace assignment, `spec.members` / `spec.children` / `spec.parent` / `memberOf` refs, and any `owner` refs for provider-owned entities **must** go through the same identity helpers. Changing only `metadata.name` while leaving relationship strings on old slugs is incomplete.

### 1.1 Users — hybrid via `multiOrgEnabled` (raw ↔ `{source}-user-{id}`)

#### Current state (main / shipped)

| Surface                      | Behavior today                                               |
| ---------------------------- | ------------------------------------------------------------ |
| Catalog User `metadata.name` | **Raw** AAP username (`entityParser` writes `user.username`) |
| Auth `findCatalogUser`       | **Raw** OAuth profile username (`resolvers.ts`)              |
| Profile username             | `spec.profile.username` = raw AAP username                   |
| Annotation                   | `ansible.com/aap-username` = raw username                    |

Catalog and auth are aligned on **raw** username today.

#### Decided

| Mode     | User `metadata.name`                      | Auth / provisioning                                                                    |
| -------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| Flag off | **Raw** AAP username (unchanged)          | Lookup by raw OAuth username — **no single-org break**                                 |
| Flag on  | `{source}-user-{id}` (e.g. `aap-user-42`) | Lookup / create by verified AAP user id (`fullProfile.id` / `ansible.com/aap-user-id`) |

| Rule                 | Detail                                                                                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Namespace            | Users always stay in `default` (deduplicated across orgs)                                                                                                                                                                                 |
| Display              | `spec.profile.username` stays raw; `spec.profile.displayName` follows §2 in both modes                                                                                                                                                    |
| Rejected             | Silent `sanitizeAapUsername` (`.`/`_` → `-`) as identity — `ops_admin`≡`ops-admin`; can confuse auth with superuser entities                                                                                                              |
| Rejected             | `{source}-user-{username}` — still folds case/punctuation; still breaks refs without fixing collisions                                                                                                                                    |
| Coupling             | Flag-on user rename **must** ship with auth resolver + `create_user` / `createSingleUser` + membership builders in the same change ([AAP-93502](https://redhat.atlassian.net/browse/AAP-93502)). Half-migrating catalog only is rejected. |
| Why gate on the flag | Same explicit opt-in as org/team/JT: single-org keeps today’s user refs; enabling multi-org is the documented user-ref + RBAC migration                                                                                                   |

**Tests (flag on):** `ops_admin` / `ops-admin` are distinct users (`aap-user-{id}` differs); `user@host` works; case-distinct AAP usernames do not collide on `metadata.name`.

AAP configured with OIDC still surfaces **AAP users** to Portal — id comes from the AAP user record, not from inventing a separate Portal IdP rename.

AAP users are platform-global: one username can belong to multiple organizations. Direct organization membership and team membership are independent. Org-only, team-only, both, and superuser are valid; team membership alone does **not** imply direct org membership. A superuser belongs to every configured org Group and also to the separate `group:default/aap-admins`; these memberships serve different purposes. One catalog User stays in `default`, rather than creating a User per org. Verified `memberOf` refs and annotations carry org/team context; the AAP Users page is the source of truth for membership details. A user display name has no `Org:` / `Team:` prefix or org suffix (§2). When the per-user team API and bulk org payload disagree, sync must not turn a missing team into org membership ([AAP-93502](https://redhat.atlassian.net/browse/AAP-93502)).

### 1.2 Provider identity matrix

Kinds stay Backstage-standard. Discriminate with `spec.type` and annotations (ADR-021), not new kinds.

| Provider / resource      | Kind                     | `metadata.name` (flag off)    | `metadata.name` (flag on) | Namespace (flag off) | Namespace (flag on)       | Notes                                                                                           |
| ------------------------ | ------------------------ | ----------------------------- | ------------------------- | -------------------- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| AAP organization         | `Group`                  | org slug                      | `{source}-org-{id}`       | `default`            | `{source}-{org-id}`       | `spec.type: organization`                                                                       |
| AAP team                 | `Group`                  | team slug                     | `{source}-team-{id}`      | `default`            | `{source}-{org-id}`       | `spec.type: team`; parent/children via builders                                                 |
| AAP user                 | `User`                   | raw username                  | `{source}-user-{id}`      | `default`            | `default`                 | Auth + create_user must use id when flag on (AAP-93502)                                         |
| AAP job template         | `Template`               | JT slug                       | `{source}-jt-{id}`        | `default`            | `{source}-{org-id}`       | `spec.type: automation-template`; `ansible.com/template-source: aap-template`                   |
| AAP workflow template    | `Template`               | WFT slug                      | `{source}-wft-{id}`       | `default`            | `{source}-{org-id}`       | Same taxonomy; provider wiring [ANSTRAT-1651](https://redhat.atlassian.net/browse/ANSTRAT-1651) |
| SCM scaffolder templates | `Template`               | YAML `metadata.name` (author) | unchanged by this ADR     | per catalog location | unchanged by this ADR     | Source `scm`; author-controlled name can collide with another `Template` in the same namespace  |
| Future AO / orchestrator | TBD                      | TBD                           | Prefer `{source}-…-{id}`  | TBD                  | Prefer source + stable id | Define before AO sync ships                                                                     |
| PAH collections          | Component / custom today | existing PAH naming           | unchanged                 | `default`            | `default`                 | Name includes repo, collection namespace/name, and version; no catalog-wide guarantee           |
| Execution environments   | Component / EE entity    | supplied by registration      | unchanged                 | supplied by caller   | supplied by caller        | Caller controls name and namespace; no catalog-wide uniqueness guarantee                        |
| Git repositories         | Component / git entity   | existing git naming           | unchanged                 | `default`            | `default`                 | Name includes normalized repo path, SCM provider, and host; no cross-provider guarantee         |
| `aap-admins`             | `Group`                  | `aap-admins`                  | `aap-admins`              | `default`            | `default`                 | Superuser membership group                                                                      |

ID uniqueness: AAP resource ids are unique per resource type **within one controller**. Namespace `{source}-{org-id}` is unique per org on that controller. If Portal ever attaches multiple controllers, extend `{source}` (or add a controller key) so names/namespaces stay globally unique in one catalog.

These guarantees cover AAP entities only. Unchanged SCM templates, PAH collections, execution environments, and Git components have provider-specific naming; this ADR does not guarantee uniqueness across providers or add a shared cross-provider collision check. Treat those collisions as a separate implementation gate.

### 2. Display conventions vs identity

The 2026-09-22 ANSTRAT-912 weekly sync agreed on these conventions. Machine names are catalog identity; human display does not define entity refs. For groups, `spec.profile.displayName` is the display value used by the RBAC picker. Do not define a second org/team display convention from `metadata.title`.

| AAP entity        | `metadata.name` (flag off) | `metadata.name` (flag on) | Display field              | Display value (flag off)    | Display value (flag on)     |
| ----------------- | -------------------------- | ------------------------- | -------------------------- | --------------------------- | --------------------------- |
| Organization      | org slug                   | `{source}-org-{id}`       | `spec.profile.displayName` | `Org: {org}`                | `Org: {org}`                |
| Team              | team slug                  | `{source}-team-{id}`      | `spec.profile.displayName` | `Team: {team}`              | `Team: {team} ({org})`      |
| User              | raw AAP username           | `{source}-user-{id}`      | `spec.profile.displayName` | `{First Last} ({username})` | `{First Last} ({username})` |
| Job template      | JT slug                    | `{source}-jt-{id}`        | `metadata.title`           | exact AAP job name          | exact AAP job name          |
| Workflow template | WFT slug                   | `{source}-wft-{id}`       | `metadata.title`           | exact AAP workflow name     | exact AAP workflow name     |
| `aap-admins`      | `aap-admins`               | `aap-admins`              | `spec.profile.displayName` | `AAP Administrators`        | `AAP Administrators`        |

For users without a first or last name, use the available name and username; if neither name exists, display the username. `spec.profile.username` and `ansible.com/aap-username` retain the raw AAP username. Collections, execution environments, and git repositories keep their existing names and display patterns. Source prefixes on User display when other IdPs sync users, and admin membership views beyond the AAP Users page, are deferred outside ANSTRAT-912.

These display changes do **not** break Casbin policies: policies use entity refs, not display values. Enabling `multiOrgEnabled` changes machine names and refs as described in §6; that migration remains necessary.

### 3. Character tokens (flag-off slugs and Day 0 org config)

Backstage names match `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$` for Portal org/team/JT slugs (hyphen-oriented). Flag-on org/team/JT/WFT names are id-only — no character tokens.

| Surface                       | Tokens                                     | Other                                                                     |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| Flag-off entity name (slug)   | today’s org/team/JT sanitizer              | `_` / space → `-`; invalid chars stripped                                 |
| Day 0 / config org name check | `@` → `-at-`, `&` → `-amp-`, `/` → `-sls-` | Used for **collision diagnostics**, not as catalog namespace when flag on |
| Username (flag off)           | **raw** — no new normalize                 | Invalid Backstage chars remain an edge case until flag on                 |
| Username (flag on)            | n/a — id-only `{source}-user-{id}`         | Raw username in title / profile / annotations only                        |

Plugins, bootc, and operator **must stay aligned** for Day 0 org-name validation helpers. Flag-on catalog namespaces use org **id**, not slug (see §5).

### 4. Always in `default` namespace

These AAP / portal-managed identities stay in Backstage `default` (they are not moved into `{source}-{org-id}`):

| Entity                     | Example                                                                         |
| -------------------------- | ------------------------------------------------------------------------------- |
| User                       | Flag off: `user:default/<raw-username>` · Flag on: `user:default/aap-user-{id}` |
| `aap-admins`               | `group:default/aap-admins`                                                      |
| PAH collections, git repos | Unchanged naming; remain in `default` today                                     |

Execution environments are **not** forced into `default`. Per §1.2 their namespace (and name) stay **caller-supplied** at registration; this ADR does not relocate them into org-scoped namespaces. The Backstage `default` namespace does not go away for Users / `aap-admins` / PAH / git.

### 5. Namespace assignment — hybrid via `multiOrgEnabled`

| Mode                  | Condition                                   | Org-scoped namespace                          |
| --------------------- | ------------------------------------------- | --------------------------------------------- |
| Flag off (Proposal B) | `multiOrgEnabled: false` (default)          | `default` — **no namespace break on upgrade** |
| Flag on               | `multiOrgEnabled: true` (even with one org) | `{source}-{org-id}` (e.g. `aap-1`)            |

Gate on the **feature flag**, not org count. Enabling the flag is the explicit breaking change for entity **names** (org/team/JT/WFT **and** users), **namespaces**, auth user lookup, and external refs (migration guide + RBAC / bookmarks).

**Why `{source}-{org-id}` instead of `{source}-{org-slug}`:** deterministic; immune to org rename, case, punctuation, transliteration, and 63-char truncation collisions; removes empty-slug fallback. Keep the original org name in `ansible.com/organization` (and org id in `ansible.com/aap-org-id`) for display and support. `spec.profile.displayName` is the normative Group display field (§2). Call (2026-09-18) preferred slug namespaces; review superseded that for collision safety (same rationale as id-based entity names).

Validate the final namespace against Backstage’s 63-character and character rules (numeric ids keep this trivial).

AAP org name `"Default"` with id `1` → flag-on namespace `aap-1` (not the Backstage `default` namespace, and not `aap-default`).

Example refs — **flag off** (unchanged from today — slug names in `default`):

```
group:default/default
group:default/deploy-team
template:default/hello-world
user:default/alice
group:default/aap-admins
```

Example refs — **flag on** (Engineering id=2, Platform Ops id=3; user id=42):

```
group:aap-2/aap-org-2
group:aap-2/aap-team-5
template:aap-2/aap-jt-42
group:aap-3/aap-org-3
user:default/aap-user-42
group:default/aap-admins
```

Compared to ADR-020: when the flag is on, namespaces use `{source}-{org-id}` (not slug-only `engineering`), entity names use `{source}-{type}-{id}`, and users use `{source}-user-{id}` with auth by AAP user id. When the flag is off, names and namespaces stay as today.

### 6. Catalog refresh and external refs

Scheduled org/team and JT providers use `applyMutation({ type: 'full' })`. The next full sync replaces provider-owned entities — no one-time catalog migration job. Document updates for **external** refs (RBAC CSV, bookmarks, favourites) when enabling `multiOrgEnabled` (org/team/JT/WFT names **and** namespaces **and** user refs change together). Flag-off upgrades do not rewrite those refs. `createSingleUser` must emit the flag-appropriate user name; auth must resolve the same way ([AAP-93502](https://redhat.atlassian.net/browse/AAP-93502)).

### 7. Day 0 alignment

Bootc and operator validate **configured AAP org names** in `orgs` / `spec.plugins.catalog.orgs`.

- **Always:** sanitizer token parity with plugins for **config validation** helpers
- **Flag on:** Day 0 effective namespace / collision keys / status UX use `{source}-{org-id}` (resolve id from AAP or require id in config — implementation detail for AAP-93502 / operator stories; document chosen approach in those PRs)
- **Flag off:** Day 0 namespace logic stays on `default`

## Consequences

### Positive

- Flag off: **no entity-ref break** for single-org (slug names + raw usernames stay in `default`)
- Flag on: collision-safe `{source}-{type}-{id}` names (including `{source}-user-{id}`) + deterministic `{source}-{org-id}` namespaces
- Addresses review preferred user identity without breaking single-org upgrades
- No silent privilege confusion from `_`/`.` username folding
- Clear provider matrix; shared builders required for relationships
- Agreed group and user display conventions keep RBAC pickers readable without changing entity identity

### Negative

- Flag on: org/team/jt/wft/user **name**, **namespace**, and **auth** migration together — RBAC / favourites / external refs (larger blast radius than namespaces-only)
- Flag on: namespaces differ from both ADR-020 slug-only **and** the call’s `{source}-{slug}` sketch — migration guide must show `aap-{id}`
- Flag off: slug collisions (case-only JT names, org↔team same slug) and raw-username Backstage-invalid chars remain until the flag is enabled
- Implementation ([AAP-93502](https://redhat.atlassian.net/browse/AAP-93502)) must keep catalog + auth + create_user in lockstep when the flag flips

### Neutral / follow-ups

- ADR-026 / migration guide: flag-on user refs `user:default/aap-user-{id}`; auth by AAP user id
- AAP-93502: implement hybrid user naming + auth + regression tests (`ops_admin`/`ops-admin`, etc.)
- Forward-looking AAP object type-token appendix — separate from ADR-027
- Portal org/template metadata views (RBAC authoring) — separate stories
- Workflow template provider wiring (ANSTRAT-1651)
- Multi-controller identity key — separate decision if needed
- Overview Favourites: use `metadata.title` + real namespace in links (follow-up UI)

## Related

- [ADR-020](020-multi-org-namespace-isolation.md) — Multi-org namespace isolation (partially superseded)
- [ADR-021](../host/021-template-type-taxonomy.md) — Template type taxonomy
- [ADR-022](022-multi-org-rbac-and-auth.md) — Multi-org RBAC and auth
- [ADR-026](026-multi-org-architecture-overview.md) — Multi-org architecture overview
- [ANSTRAT-912](https://redhat.atlassian.net/browse/ANSTRAT-912) — Portal multi-org support
- [AAP-93502](https://redhat.atlassian.net/browse/AAP-93502) — Implement naming + auth wiring (includes flag-on `{source}-user-{id}`)
- `plugins/backstage-rhaap-common/src/utils/nameFormatting.ts` — shared naming helpers
- `plugins/auth-backend-module-rhaap-provider/src/resolvers.ts` — flag off: raw username; flag on: AAP user id
- `bootc/scripts/lib/yaml-helper.py` — Day 0 sanitizer (bootc)
- `internal/controller/catalog_orgs.go` — Day 0 sanitizer (operator)
