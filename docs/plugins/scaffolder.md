# Scaffolder backend modules

The former monolithic scaffolder backend module is replaced by two backend modules:

- `@ansible/plugin-scaffolder-backend-module-aap` provides the five `rhaap:*` actions, AAP template filters, and the `aap-api` Controller autocomplete provider. Its source is in `workspaces/aap/plugins/scaffolder-backend-module-aap/`.
- `@ansible/plugin-scaffolder-backend-module-content-development` provides the three `ansible:*` creator and EE actions and the `portal-catalog` collection autocomplete provider. Its source is in `workspaces/content-development/plugins/scaffolder-backend-module-content-development/`. The `EEEntityProvider` is registered by `@ansible/catalog-backend-module-content-development` in the same workspace.

The content-development scaffolder module uses the in-process EE lifecycle service. The old `POST /ansible/ee` and `DELETE /ansible/ee/:name` routes and the monolithic scaffolder module are removed.
