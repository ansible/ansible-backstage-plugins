# ADR-002: Native Templates and Tasks integration

- **Status:** Proposed
- **Date:** 2026-11-11
- **Related work:** Native Templates and Tasks implementation plan, Step 2

## Context

The Portal scaffolder is moving toward Backstage's native Scaffolder wizard and
catalog experiences. Existing Portal SDK contributions include custom field
widgets, and AAP-generated templates need resource selectors and an AAP user
token at submission time. The implementation must make those contributions
work with the native form APIs while retaining the current Portal flow during
the migration.

The work should remain reviewable in small, stacked pull requests. Step 1's
navigation and UX decisions can be discussed independently while Step 2's field
and token contracts are implemented. This ADR does not approve a default-page
cutover or navigation change.

## Decision

Implement Step 2 in four reviewable PRs, with each PR based on the preceding PR
and retargeted to `main` as its predecessor merges:

1. **Generic native field bridge:** Register each contributed field through a
   static Backstage `FormFieldBlueprint` in the contributor's extension tree,
   paired with the existing Portal `ScaffolderFieldBlueprint`. Convert the
   contributor's legacy field options to the public native `FieldSchema` and
   `FormField` APIs. Preserve field names, components, validation, schemas, and
   defaults. Keep the dynamic Portal collector and legacy `StepForm` path for
   compatibility; do not treat runtime `createFormField` construction as native
   registration. Report invalid or unavailable required fields clearly, and
   never substitute a plain input.
2. **AAP resource fields and generated schemas:** Add AAP-owned native adapters
   for supported resource widgets. Correct generated schemas for inventory,
   tags, skip-tags, and supported picker variants. Preserve field names,
   selection shape, defaults, metadata, and conversion into the existing launch
   payload.
3. **AAP form decorator and generated template contract:** Add the
   `ansible.aap-user-token` form decorator. AAP-generated templates declare
   that decorator and require a non-empty, dedicated `ansibleAapToken` secret.
   Treat that key as reserved: reject a generated template whose survey
   variables or existing secrets use the same key, and never overwrite a
   caller-provided secret. Acquire a fresh current-user token for each
   submission and stop submission with an actionable error if auth is
   unavailable, cancelled, rejected, or returns an empty token. The decorator
   may issue an AAP token only to a template that declares it and passes the
   backend authorization checks below; this does not change the separate
   legacy `StepForm` token behavior. Before acquiring a token, the decorator
   must obtain backend authorization for the current template. The
   backend must verify the template entity reference and its immutable content
   identity against a configured allowlist of trusted AAP-generated templates
   before issuing a token. Each allowlist entry binds the entity reference to
   a pinned source revision or content digest, and the backend must verify that
   binding against the current template before authorization. Platform
   maintainers own the allowlist; changes require code review by designated
   platform/security maintainers and automated verification that the pinned
   revision or digest matches the template content. The backend must also
   authorize the caller with a dedicated `ansible.templates.use-aap-token`
   permission evaluated for that template. A template's
   `spec.formDecorators` declaration alone is not authorization. The
   authorization decision must bind the exact template reference and pinned
   revision or digest to the later task-creation request in a backend-verifiable
   way. At task creation, the backend must resolve the current template and
   verify that it still matches that authorized identity; reject missing,
   stale, or mismatched identity before creating the task, even when the
   request contains the required secret. Create the task from that exact
   verified snapshot or immutable revision so later changes cannot alter the
   content it executes. Do not trust a client-supplied template reference or
   digest without verifying it against the allowlist.
4. **Backend secret enforcement:** Use a supported backend extension point to
   forward form decorators and validate the required secret before task
   creation. Keep the launch action's existing token requirement and reject
   missing or empty credentials before any AAP launch side effect. Do not
   change the separate background-polling credential policy.

Across all PRs, keep the token out of parameters, catalog metadata, URLs,
frontend persistence, and logs. Preserve the existing legacy `StepForm` token
behavior and default navigation until their separately reviewed cutover.
Resource schemas must give `root_inventory` an explicit type and define array
item schemas for `root_tags` and `skip_tags`. Do not use unchecked casts or
silently drop schema constraints while adapting legacy fields.

### Implementation plan and review gates

#### PR 1: Generic native field bridge

**Scope:** Add a paired Portal/native field blueprint helper in
`portal-extension-api`; update the APME field contributor to use the paired
blueprints; retain the host's dynamic field collector for the legacy Portal
wizard and report denied or disabled fields clearly. Add focused API and host
tests.

**Review gate:** Verify public API exports against installed versions and
prove a contributed field is returned by the native `formFieldsApiRef` through
the app extension tree. Cover legacy schema conversion, preserved defaults and
validators, duplicate field names, denied permissions, absent or disabled
contributors, and explicit failure reporting on the legacy Portal path.
Unsupported widgets must never fall back silently.

The native host installs `createPortalScaffolderPlugin()` from
`@ansible/portal-extension-host/alpha` in place of the unadapted Scaffolder
plugin. Its public API extension collects both native API-attached and
compatibility/page-attached fields, validates their complete name set, and
rejects collisions before the wizard mounts. It preserves the loaded field
objects, including their components, schemas and validators.

The installed `FormField` return type is opaque. The adapter runtime-checks
the creation-time `name` property and rejects unknown shapes; it does not
import or unwrap private Backstage internals. Scaffolder `1.38.2` adds built-in
fallback fields after API loading, so the adapter reserves their names for
upstream built-in extension IDs, including the fallback-only `Secret` field.
Disabling a built-in native extension does not make its fallback name available
to contributors. Revalidate this compatibility boundary and fallback-name list
when upgrading Scaffolder. The host peer dependency is pinned to `1.38.2`
until those checks pass for another version. Dynamic hosts must install the same
adapter.

#### PR 2: AAP resource fields and generated schemas

**Scope:** Add AAP-owned native adapters beside existing widgets under
`workspaces/content-development/plugins/portal-scaffolder/src/components/Scaffolder/`
(including `AAResourcePicker`); update
`workspaces/aap/plugins/catalog-backend-module-rhaap/src/providers/dynamicJobTemplate.ts`
and its tests.

**Review gate:** Cover inventory defaults, selection, and required validation;
tag and skip-tag item schemas and empty values; supported picker variants; and
loading, error, and selection-change behavior. Validate the selected value
shape and its conversion to the existing launch payload. A successful template
with no prompted fields is not sufficient evidence.

#### PR 3: AAP form decorator and generated-template contract

**Scope:** Add the AAP-owned decorator and blueprint under
`workspaces/content-development/plugins/portal-scaffolder/src/` using the
installed public `FormDecoratorBlueprint` and
`createScaffolderFormDecorator` APIs. Update
`workspaces/aap/plugins/catalog-backend-module-rhaap/src/providers/dynamicJobTemplate.ts`
and provider tests.

**Review gate:** Verify the decorator ID and dependency, fresh token acquisition,
and failure-before-submit for unavailable authentication, cancellation or
rejection, and an empty token. Prove that the authorization result binds the
allowlisted template reference and pinned revision or digest for enforcement at
task creation. Provider tests must verify the declared
decorator and required `ansibleAapToken` secret schema, reject collisions with
survey variables or existing secrets, and prove that an existing password
survey secret remains unchanged. Before changing generated templates from the
legacy `aapToken` key to `ansibleAapToken`, PR 3 must either update legacy
`StepForm` submissions to provide the canonical key for new-contract templates
while preserving compatibility for already-generated templates, or keep
generated templates able to consume the legacy key until the old submission
path is retired. Tests must cover the selected transition and prove neither
token key overwrites a password survey variable. Backend tests must prove that
authorization checks the template entity reference against the configured
trusted-template allowlist and evaluates `ansible.templates.use-aap-token` for
the caller and that template before any token is issued. A template that only
declares the decorator, but is not trusted or lacks permission, must not obtain
an AAP token.

#### PR 4: Backend secret enforcement

**Scope:** Locate the Scaffolder backend parameter-schema/task-creation
integration in the host app or relevant backend module. At task creation,
resolve the current template and verify that its reference and pinned revision
or digest match the identity authorized before token issuance. Reject changed,
missing, or unverifiable identity before task creation, regardless of whether
the request includes `templateRef` or valid secrets. Create the task from the
exact verified snapshot or immutable revision rather than reloading mutable
content by reference. Preserve the existing check in
`workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/actions/aapLaunchJobTemplate.ts`
and extend its tests where needed; add focused tests at the confirmed backend
integration point.

**Review gate:** Prove missing or empty secrets are rejected before task
creation or AAP calls, valid secrets still reach the launch action, and generic
templates do not request or receive AAP credentials. Prove that a template
changed after token authorization is rejected before task creation, and that a
client-supplied reference or digest cannot bypass the backend identity check.
Prove that later template edits cannot change the content executed by an
already-created task. Confirm the backend hook can carry and enforce the
authorized identity and verified snapshot before coding; if no supported hook
exists, record a blocker instead of importing private internals.

### Dependencies and sequencing

PR 1 establishes the generic bridge. PR 2 depends on PR 1. PR 3 can proceed
alongside PR 2 after its public decorator APIs are verified. PR 4 depends on
PR 3's provider contract and confirmation of a supported backend hook. These
remain separate stacked PRs with focused review surfaces.

## Open questions for discussion

These questions are intentionally unresolved and should be discussed alongside
implementation without blocking independent PR work. Any answer that changes
the contracts above updates this ADR before the affected PR proceeds.

### Baseline and deployment target

- Is the refreshed upstream `main` revision `59c2b221` the agreed implementation
  baseline? The planning checkout was `8f8368d9`; confirm the target baseline
  before treating environment-specific differences as regressions.
- Which installed Backstage dependency versions and implementation revision
  should be recorded as the baseline?
- Which target RHDH version and NFS image should be used for validation?

### Templates and Tasks UX

- Which actions should be page-wide, and which should appear only on Templates?
- Do built-in category, tag, owner, and search filters plus configured groups
  satisfy the required filtering needs?
- Should additional content appear as tabs or as sections in the template list?
- Should Actions, Template Editor, and Templating Extensions be visible, and to
  which users?
- How should the Add Templates workflow work, and where should its route or
  dialog lead?
- What should happen to the old standalone template-detail route?

### Public API and backend integration

- If required custom filters or in-list panels are unsupported by the public
  APIs, should the project request an upstream hook, upgrade, or backport, or
  choose another supported composition?
- Which supported Scaffolder backend extension point can forward declared form
  decorators, bind the authorized template identity to task creation, and
  validate `spec.secrets.schema` before task creation? If no supported hook
  exists, record a blocker before implementing private-internal integration.
- What is the expected user-visible behavior when the current-user auth flow
  is cancelled or unavailable in the target RHDH deployment?

### Resource field behavior

- Confirm the supported resource-picker variants and the exact selected-value
  shapes/defaults for inventory, tags, skip-tags, and any other AAP fields.
- Confirm which template cases require an unavailable or disabled field to
  block task creation, and the exact user-facing error wording.

## Consequences

- Native fields enter Backstage through contributor-level static blueprints and
  are loaded by the native Scaffolder's public form-fields API. The existing
  Portal field collector remains the compatibility path for its custom wizard.
- The field bridge, AAP resource widgets, token decorator, and backend guard
  have separate review surfaces and can be reviewed in dependency order.
- Step 1 UX discussions continue independently; this ADR does not promise a
  new page layout or default navigation.
- Native form submission for AAP templates requires current-user authentication
  and a backend validation boundary before task creation.
- Generic templates remain independent of AAP authentication.
- The plan remains conditional on confirming public Backstage APIs and the
  target RHDH deployment behavior before relying on them.

## References

- Native Templates and Tasks implementation plan PDF (source, pages 5–7)
- `.sdlc/research/scaffolder-implementation-guide.md`

## Field-level authorization boundary

Field-level entitlements are explicitly deferred until a concrete field use case defines the required context and contract. For this step, field eligibility is controlled by configuration and `requiredPermission` checks. Permission to execute a template and authorization to operate on its selected AAP resource are separate concerns; backend authorization must enforce access to the actual resource. No field-level entitlement declaration or check is part of this step.
