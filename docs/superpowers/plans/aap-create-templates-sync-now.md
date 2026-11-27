# AAP Create Templates Sync Now Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an SDK-registered MUI v5 `Sync Now` action beside `Register Existing Component` on `/create/templates`.

**Architecture:** The Portal extension API will define a Scaffolder header-action Blueprint that the AAP frontend plugin uses to register an action. A small Yarn patch adds an optional header-action input to Backstage Scaffolder's NFS templates subpage and renders those contributions beside the built-in register button. The action uses a reusable button from `@ansible/portal-plugin-sdk` and requests the existing AAP job-template sync route.

**Tech Stack:** React, TypeScript, Backstage Scaffolder 1.38.2, Portal extension API/host, MUI v5.

**Spec:** [docs/superpowers/specs/aap-create-templates-sync-now.md](../specs/aap-create-templates-sync-now.md)

## Global Constraints

- The UI component uses MUI v5.
- The contribution is registered through the Portal extension API from an AAP workspace frontend plugin.
- The action appears beside `Register Existing Component` on `/create/templates`.
- Backend authorization remains authoritative; the existing sync endpoint is reused.

## Review Focus

- Unauthorized users must not be offered an enabled sync action; use the existing Portal superuser convention.
- The pending state must prevent duplicate requests.
- A failed request must restore the button so the user can retry.
- The host adapter must preserve Scaffolder template selection, filters, categories, and existing navigation.
- Missing or invalid contributions must not prevent the template page from rendering.

---

### Task 1: Define the Scaffolder header action and reusable SDK button

**Files:**

- Modify: `workspaces/portal-core/plugins/portal-extension-api/src/nfs/`
- Modify: `workspaces/portal-core/plugins/portal-extension-api/src/alpha.ts`
- Create: `workspaces/portal-core/plugins/portal-plugin-sdk/src/components/SyncNowButton/`
- Modify: `workspaces/portal-core/plugins/portal-plugin-sdk/src/components/index.ts`
- Modify: `workspaces/portal-core/plugins/portal-plugin-sdk/package.json`

- [ ] Define a typed Scaffolder template-list header action contribution and its Backstage blueprint, following the existing NFS descriptor and blueprint conventions.
- [ ] Export the new descriptor and blueprint through the API alpha entry point.
- [ ] Implement and export a MUI v5 `SyncNowButton` with label, sync icon, pending, disabled, and click-handler props.
- [ ] Add the MUI v5 package declarations required by the SDK component.

### Task 2: Add a Scaffolder templates header-action slot

**Files:**

- Modify: `.yarn/patches/@backstage-plugin-scaffolder-npm-1.38.2-c0f5f68562.patch`
- Modify: `package.json`
- Modify: `yarn.lock`

- [ ] Patch the existing Scaffolder templates subpage with an optional typed header-actions input, and render its contributions beside the register action.
- [ ] Preserve the current NFS template filters, cards, template wizard, and routes.
- [ ] Apply the patch through the root Yarn resolution and update the lockfile.

### Task 3: Register the AAP Sync Now contribution

**Files:**

- Modify: `workspaces/aap/plugins/backstage-rhaap/src/alpha.tsx`
- Create: `workspaces/aap/plugins/backstage-rhaap/src/components/ScaffolderSyncNow/`
- Modify: `workspaces/aap/plugins/backstage-rhaap/package.json` only if API dependencies need declaration.

- [ ] Register the header action through the Portal extension API from the AAP frontend plugin.
- [ ] Gate availability with the existing Portal superuser hook and call the existing catalog job-template sync route.
- [ ] Show a pending state during the request and restore an actionable state if the request fails.

### Task 4: Review the final integration

- [ ] Review the diff for unintended changes to the `/self-service/catalog` route and unrelated Scaffolder routes.
- [ ] Run the scoped lint commands for the modified packages, as required by the repository guidance.
- [ ] Report validation results and any behavior that could not be confirmed in the running app.
