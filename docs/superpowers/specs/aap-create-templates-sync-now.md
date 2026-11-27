# Sync Now on Create Templates

## Goal

Add a `Sync Now` action next to `Register Existing Component` on `/create/templates`. The action comes from an AAP frontend plugin through the Portal extension SDK and uses MUI v5.

## Design

The default app uses Backstage's NFS Scaffolder templates subpage. That page has no extension slot beside its register button, and replacing its subpage would also replace the template launch wizard. A small Yarn patch to the installed Scaffolder package will add an optional header-action extension input to the existing templates subpage. The built-in list and wizard remain in place. The AAP plugin registers its action through a Blueprint exported by the Portal extension API, and the reusable MUI v5 button is exported by the Portal SDK.

The action will request the existing AAP job-template catalog sync through the catalog API, indicate when the provider sync is pending, and follow the existing Portal superuser visibility convention. Server-side authorization remains authoritative. The existing `/self-service/catalog` page and its sync behavior are outside this change.

## Approaches

1. **Patch Backstage Scaffolder with a typed action slot (selected).** Keeps the stock template list and wizard, while allowing the AAP plugin to register the action through the SDK. The patch must be reviewed when Scaffolder is upgraded.
2. **Replace the Scaffolder templates subpage.** Avoids a package patch, but would require reimplementing the existing wizard and risks losing Backstage behavior.
3. **Use the legacy Scaffolder page override.** Avoids the NFS package patch, but would not add the action to the default app shell shown in the request.

## UI and behavior

- Place an outlined `Sync Now` MUI v5 button beside `Register Existing Component`.
- Use a sync icon and disabled/pending state while the request is active.
- Make the action available to AAP superusers, matching the existing Portal sync controls.
- Call the existing backend job-template sync route; do not add a new backend sync operation.
- Preserve the existing template list's title, search and filters, category grouping, template cards, register action, and task navigation.

## Scope

The change adds a typed Scaffolder header-action Blueprint, an SDK button, a narrow patch to the Scaffolder templates subpage, and an AAP frontend plugin contribution. It does not replace the `/self-service/catalog` implementation or change backend authorization.

## Constraints

- UI component uses MUI v5.
- Contribution is registered through the Portal SDK/API from an AAP workspace frontend plugin.
- Button appears beside `Register Existing Component` at `/create/templates`.
