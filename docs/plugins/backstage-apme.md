# @ansible/plugin-backstage-apme

Frontend contributor for Ansible content quality and modernization. Source:
`workspaces/apme/plugins/backstage-apme`.

## Native contributions

The `./alpha` entry point exports the `apme` frontend plugin with Quality,
Quality activity, and Dependencies tabs; overview summaries; scan and
deregistration actions; catalog tabs/columns; Add repository; and a repository
URL scaffolder field.

The plugin contributes through Portal Blueprints rather than importing
self-service page components. Components use the APME API factory registered
through the native plugin.

## Availability and lifecycle

Scanning requires `ansible.apme.enabled: true`, the host-resolved
`apme.scanning` entitlement, and applicable permissions. Configuration alone
does not authorize an operation.

APME owns scan-summary refresh while a background operation is active.
The native scan action and interactive Quality workflow have different
lifecycles; completed submission is not proof that remediation or a PR occurred.

See [NFS composition](../next/portal-sdk-nfs-composition.md),
[APME catalog backend](catalog-apme.md), and
[APME shared contracts](backstage-apme-common.md).
