# Scaffolder backend modules

The former monolithic scaffolder backend module is replaced by two backend modules:

- `@ansible/plugin-scaffolder-backend-module-aap` provides the five `rhaap:*` actions, AAP template filters, and the `aap-api` Controller autocomplete provider. Its source is in `workspaces/aap/plugins/scaffolder-backend-module-aap/`.
- `@ansible/plugin-scaffolder-backend-module-content-development` provides the three `ansible:*` creator and EE actions and the `portal-catalog` collection autocomplete provider. Its source is in `workspaces/content-development/plugins/scaffolder-backend-module-content-development/`.

## Breaking migration

This cutover removes `@ansible/plugin-scaffolder-backend-module-backstage-rhaap` and does not retain a compatibility shim. Update backend wiring to load the AAP and content-development modules above.

The EE registration route `POST /ansible/ee` and cleanup route `DELETE /ansible/ee/:name` are removed, with no HTTP replacements. Existing callers must stop invoking them. EE definition creation should use the `ansible:create:ee-definition` Scaffolder action; that action uses the in-process lifecycle service for catalog registration and cleanup.
