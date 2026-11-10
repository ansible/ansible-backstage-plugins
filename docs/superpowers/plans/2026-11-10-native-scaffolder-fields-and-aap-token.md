# Native Scaffolder Fields and AAP Token Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Portal SDK fields and AAP resource/token inputs work with upstream Backstage Scaffolder APIs and the existing host while preserving current navigation and the AAP launch contract.

**Architecture:** Target upstream Backstage Scaffolder form-field and form-decorator APIs for the native integration. Keep the existing Portal SDK field descriptor contract and adapt it in the optional host layer. Keep AAP resource widgets and the user-token decorator in the existing AAP-owned `portal-scaffolder` contributor. Make generated AAP templates declare the decorator and required task secret. Leave the current custom `NativeScaffolderPage` and default navigation for the later page-composition step; retain the existing legacy field path for compatibility.

**Tech Stack:** Backstage 1.54.9 baseline; `@backstage/plugin-scaffolder@1.38.2`; `@backstage/plugin-scaffolder-react@2.0.3`; frontend extension blueprints; React, RJSF, Jest and Testing Library.

**Spec:** Native Templates and Tasks implementation plan PDF supplied in this conversation, implementation sequence 2.

## Global Constraints

- Do not change default navigation as part of this work.
- Keep AAP APIs and authentication out of generic Portal host packages.
- Preserve current legacy AAP field behavior during the migration and rollback window.
- AAP job launches use the current signed-in user's token from task secrets; never pass the token in parameters, catalog metadata, URLs, frontend persistence or logs.
- Generic templates do not request the AAP token decorator or acquire AAP credentials.
- Convert legacy field schemas explicitly and validate them; do not use unchecked casts or drop schema metadata.
- Keep the `rhaap:launch-job-template` required-token check. A service token may remain a separate polling credential only.

## Review Focus

- Legacy field schemas with malformed or missing `returnValue` data must fail clearly rather than render an incomplete native field.
- AAP inventory is a single resource object; tags and skip-tags are arrays of strings, including their defaults and empty selections.
- Existing task secrets must survive decorator updates while `aapToken` is refreshed for each submission.
- Missing AAP auth, cancelled login, rejected token acquisition and empty tokens must stop submission before task creation.
- A disabled, missing or duplicate field contribution must not silently fall back to a plain text input.

---

### Task 1: Bridge Portal SDK fields to upstream Scaffolder form fields

**Files:**

- Create: `workspaces/portal-core/plugins/portal-extension-host/src/nfs/toNativeScaffolderField.ts`
- Create: `workspaces/portal-core/plugins/portal-extension-host/src/nfs/toNativeScaffolderField.test.ts`
- Create: `workspaces/portal-core/plugins/portal-extension-host/src/nfs/createPortalScaffolderFormFieldsApi.ts`
- Create: `workspaces/portal-core/plugins/portal-extension-host/src/nfs/createPortalScaffolderFormFieldsApi.test.ts`
- Modify: `workspaces/content-development/plugins/portal-scaffolder/src/alpha.tsx`
- Modify: `workspaces/content-development/plugins/portal-scaffolder/src/alpha.test.tsx`

**Interfaces:**

- Consumes: the existing `ScaffolderFieldDescriptor` loader contract and native `FormFieldBlueprint` loaders from the app tree.
- Produces: an optional host adapter for upstream `ScaffolderFormFieldsApi` that returns native `FormField` values created with `createFormField`, preserving field name, component, validation, JSON/UI schemas, defaults and form context. The Portal SDK descriptor contract remains source-compatible.

- [x] **Step 1: Add converter tests** for complete return/UI schemas, default values, form context, malformed schema, name mismatch, and preserved component/async validation.
- [x] **Step 2: Run the converter test** and confirm it fails for the missing adapter.
- [x] **Step 3: Implement the checked conversion** in `toNativeScaffolderField.ts`; use `makeFieldSchema` to construct a typed native wrapper, copy the legacy return/UI JSON Schemas without loss, and reject unsupported shapes with a descriptive error.
- [x] **Step 4: Add the optional form-fields API adapter** that combines native blueprint fields with adapted Portal SDK fields for the upstream Scaffolder page.
- [x] **Step 5: Wire the adapter only in the optional Portal Scaffolder host** and keep the current custom page plus legacy `FieldExtensionOptions` path unchanged.
- [x] **Step 6: Test permission/entitlement denial, duplicate names, disabled/missing contributors, and unavailable required fields; keep failure-closed behavior.**
- [x] **Step 7: Run package-scoped portal-extension-host and portal-scaffolder tests and type checks.**

### Task 2: Add the AAP native resource field and complete generated schemas

**Files:**

- Modify: `workspaces/content-development/plugins/portal-scaffolder/src/alpha.tsx`
- Modify: `workspaces/content-development/plugins/portal-scaffolder/src/components/Scaffolder/AAResourcePicker/extensions.ts`
- Modify: `workspaces/content-development/plugins/portal-scaffolder/src/components/Scaffolder/AAResourcePicker/AAPResourcePicker.tsx`
- Modify: `workspaces/content-development/plugins/portal-scaffolder/src/components/Scaffolder/AAResourcePicker/AAPResourcePicker.test.tsx`
- Modify: `workspaces/aap/plugins/catalog-backend-module-rhaap/src/providers/dynamicJobTemplate.ts`
- Modify: `workspaces/aap/plugins/catalog-backend-module-rhaap/src/providers/dynamicJobTemplate.test.ts`

**Interfaces:**

- Consumes: AAP auth API, scaffolder autocomplete API, existing `AAPResourcePicker` value conventions.
- Produces: an AAP-owned native field contribution registered through the public native form-field API, plus complete generated JSON Schemas for resource-backed prompts.

- [x] **Step 1: Add schema assertions**: inventory has `type: object`; tags and skip-tags have `type: array` with `items.type: string`; defaults and empty-value normalization match the launch payload contract.
- [x] **Step 2: Add adapter tests** for inventory object selection, tags/skip-tags array selection, required validation, preserved defaults and autocomplete loading/error behavior.
- [x] **Step 3: Register the AAP resource picker through the native field blueprint/API** without removing its existing field extension registration.
- [x] **Step 4: Correct `dynamicJobTemplate.ts` schema generation** and retain resource metadata, field names and existing backend payload shapes.
- [x] **Step 5: Run the relevant portal-scaffolder and catalog-provider tests and type checks.**

### Task 3: Add the AAP user-token form decorator and generated secret contract

**Files:**

- Create: `workspaces/content-development/plugins/portal-scaffolder/src/components/Scaffolder/AAPTokenField/AAPUserTokenDecorator.ts`
- Create: `workspaces/content-development/plugins/portal-scaffolder/src/components/Scaffolder/AAPTokenField/AAPUserTokenDecorator.test.ts`
- Modify: `workspaces/content-development/plugins/portal-scaffolder/src/alpha.tsx`
- Modify: `workspaces/aap/plugins/catalog-backend-module-rhaap/src/providers/dynamicJobTemplate.ts`
- Modify: `workspaces/aap/plugins/catalog-backend-module-rhaap/src/providers/dynamicJobTemplate.test.ts`

**Interfaces:**

- Consumes: `rhAapAuthApiRef`, `createScaffolderFormDecorator`, and `FormDecoratorBlueprint` from the installed public/alpha scaffolder-react API.
- Produces: decorator ID `ansible.aap-user-token`; on execution it obtains a fresh user access token and merges it into `aapToken` in task secrets without changing form parameters.

- [x] **Step 1: Add decorator tests** for successful token acquisition, preserving existing secrets, a refreshed token on a later invocation, cancelled/rejected auth, missing auth and an empty token.
- [x] **Step 2: Implement and register the decorator** using the AAP-owned contributor and public blueprint, leaving legacy `AAPTokenField` registration intact.
- [x] **Step 3: Add the generated template declaration** under `spec.formDecorators` and `spec.secrets.schema`, requiring a non-empty string `aapToken`.
- [x] **Step 4: Assert generated templates keep the launch action bound to `secrets.aapToken`**, keep that secret out of `parameters`, and do not add the decorator to generic templates.
- [x] **Step 5: Verify backend missing-token tests still prove failure before AAP launch** and that any service credential remains scoped to polling only.
- [x] **Step 6: Run relevant portal-scaffolder, catalog-provider and AAP launch-action tests and package type checks.**

### Task 4: Verify compatibility and scope

**Files:**

- Review: native and legacy scaffolder composition tests in `portal-extension-host` and `portal-scaffolder`.
- Review: generated entity tests and `aapLaunchJobTemplate.test.ts`.

- [x] Confirm the native host consumes the new field/decorator declarations and the existing host still renders legacy fields.
- [x] Confirm no navigation or default-host configuration changed.
- [x] Confirm no token enters template parameters, session storage or logs.
- [x] Run the changed package lint/type-check commands after the focused tests pass.
