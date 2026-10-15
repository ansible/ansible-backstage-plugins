# @ansible/scaffolder-backend-module-apme

Scaffolder backend module for APME repository registration. Source:
`workspaces/apme/plugins/scaffolder-backend-module-apme`.

## Action contract

Registers `ansible:register:git-repository`. Inputs describe the SCM provider,
repository owner/name/URL, and default branch. The action resolves the initiating
user and executes the registered `apme.repository.register` operation.

The action delegates persistence and catalog ownership to the APME catalog
module; it does not import self-service frontend components or live in the AAP
scaffolder module. Legacy owner input is not treated as authorization.

## Integration

```ts
backend.add(import('@ansible/scaffolder-backend-module-apme'));
```

Install [APME catalog backend](catalog-apme.md) and
[Portal operation services](portal-operations-backend.md) before using the action.
The repository registration template lives under
`workspaces/apme/plugins/backstage-apme/templates/apme-register-git-repository/`;
it must also be registered as a catalog location.

See [APME frontend](backstage-apme.md) for the native field and workflow launcher.
