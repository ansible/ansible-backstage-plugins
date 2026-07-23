# @ansible/plugin-backstage-apme (eap-next)

Thin Portal host for APME Quality on catalog entities.

## Scope

- Resolves/registers an APME project from the entity source location
- Mounts shared `@apme/ui-workflow` (`ProjectWorkflowPanel`)
- Talks to Gateway via `catalog-backend-module-apme` (`/api/catalog/apme`)

## Not in this package

- MUI remediation steppers / file-bundle review UI
- Portal-side git commit/push (forbidden by APME ADR-056)
- Fleet Analytics

## Local enablement (EAP)

```yaml
ansible:
  apme:
    enabled: true
    baseUrl: http://localhost:8080
    checkSSL: false
    publishViaGateway: true
```

`@apme/ui-workflow` is vendored at `plugins/apme-ui-workflow` (synced from
`apme` `frontend/packages/ui-workflow`) until the package is published to npm.
