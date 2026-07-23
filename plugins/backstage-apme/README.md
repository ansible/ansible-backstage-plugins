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

`@apme/ui-workflow` is installed from an APME GitHub Release tarball (ADR-066),
not a vendored workspace copy. Bump the dependency URL in `package.json` when
APME tags a new `ui-workflow-v*` release, then run `yarn install`.

Current pin:

```text
https://github.com/ansible/apme/releases/download/ui-workflow-v0.1.1/apme-ui-workflow-0.1.1.tgz
```
