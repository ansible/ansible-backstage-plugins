# @ansible/plugin-backstage-apme (eap-next)

Thin Portal host for APME Quality on catalog entities.

Architecture (approach, FE/BE wiring, `@apme/ui-workflow`): [ARCHITECTURE.md](./ARCHITECTURE.md).

## Scope

### Private Hub installation sources and TLS

Configure repositories used for APME collection installation independently of
the repositories synchronized into the catalog:

```yaml
ansible:
  rhaap:
    baseUrl: https://aap.example.com
    token: ${AAP_TOKEN}
    checkSSL: true
  apme:
    collectionRepositories:
      - rh-certified
      - validated
      - community
```

These repository names refer to the connected Private Automation Hub. Required
collections and their dependencies must be present there. Omitting
`collectionRepositories` retains the catalog repository fallback; an explicit
empty list removes Portal-managed Hub sources. Manually configured Gateway
sources are preserved.

Portal forwards the Hub's `ansible.rhaap.checkSSL` as `validate_certs` through
Gateway to Galaxy Proxy. An explicit `false` supports lab certificates;
verified connections require the Hub CA in the proxy's trust bundle, configured
through the operator or Helm. This is separate from `ansible.apme.checkSSL`,
which controls the Portal-to-APME connection. Deploy the APME TLS-field support
before upgrading Portal; older Gateways ignore the new field. Source changes
do not introduce public Galaxy fallback or allow scans with missing collections.

### Workflow integration

- Resolves/registers an APME project from the entity source location
- Mounts shared `@apme/ui-workflow` (`ProjectWorkflowPanel`)
- Talks to Gateway via `catalog-backend-module-apme` (`/api/catalog/apme`)
- Owns the **Add repository** scaffolder Template YAML under
  `templates/apme-register-git-repository/` (catalog content — must be loaded
  via `catalog.locations`; not included in `export-dynamic` by default)

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
https://github.com/ansible/apme/releases/download/v2026.9.4/apme-ui-workflow-2026.9.4.tgz
```
