# Scaffolder backend modules

The former monolithic scaffolder backend module is replaced by two backend modules:

- `@ansible/plugin-scaffolder-backend-module-aap` provides the five `rhaap:*` actions, AAP template filters, and the `aap-api` Controller autocomplete provider. Its source is in `workspaces/aap/plugins/scaffolder-backend-module-aap/`.
- `@ansible/plugin-scaffolder-backend-module-content-development` provides the three `ansible:*` creator and EE actions and the `portal-catalog` collection autocomplete provider. Its source is in `workspaces/content-development/plugins/scaffolder-backend-module-content-development/`.

## Breaking migration

This cutover removes `@ansible/plugin-scaffolder-backend-module-backstage-rhaap` and does not retain a compatibility shim. Update backend wiring to load the AAP and content-development modules above.

The EE registration route `POST /ansible/ee` and cleanup route `DELETE /ansible/ee/:name` are removed, with no HTTP replacements. Existing callers must stop invoking them. EE definition creation should use the `ansible:create:ee-definition` Scaffolder action; that action uses the in-process lifecycle service for catalog registration and cleanup.

## EE build authorization (F-03)

`POST /api/catalog/ansible/ee/build` requires `ansible.execution-environments.build`
(action `update`) in addition to EE view permission, catalog read permission,
access to the requested entity, and valid SCM credentials. A view-only user cannot
dispatch a build. The catalog and details pages expose Build only when the build
permission is allowed; the backend enforces it independently.

With permission enforcement enabled, grant the new permission only to roles that
should start builds. For example, an operator-managed RBAC policy can grant an
existing EE builder role:

```csv
p, role:default/ee-builder, ansible.execution-environments.build, update, allow
```

This grant does not replace the existing view/read grants. No build grant is
automatically added to viewer roles. Configure the deployment's permission policy
to deny this permission for users without an explicit grant; an allow-all policy
or disabled permission enforcement cannot distinguish builders from viewers.

Service callers are denied unless their authenticated Backstage subject appears
in the separate build allowlist:

```yaml
catalog:
  eeBuild:
    allowedServiceSubjects: []
```

Operators may add an approved service subject to this list after agreeing its
build use case. Missing or empty configuration denies every service caller.
Matching is exact, with no wildcard expansion. Registration in
`backend.auth.externalAccess` alone does not grant build access, and this list
does not create service credentials. Approved services still pass the permission,
entity-access, and SCM-credential checks. The explicit service guard applies even
if the permission policy allows service principals by default.

Authorization failures prevent GitHub workflow or GitLab pipeline dispatch.
Unauthenticated requests return 401 and denied permissions or service subjects
return 403. Permission-service failures also prevent dispatch.

This policy covers the retained build endpoint and its UI caller. Direct workflow
dispatch in generated scaffolder templates requires a separate authorization
assessment; lifecycle registration and deletion permissions are unchanged.
