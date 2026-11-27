# @ansible/portal-health-backend

Backstage backend plugin that aggregates portal plugin health statuses and exposes them at GET /api/portal-health/status. Reads from the push-based HealthRegistry populated by portal-plugin-node's pushHealthStatus().

## Developer preview

This preview is intended for plugin integration testing. It carries temporary
accepted findings in upstream dependencies and is not a production-readiness
certification. Review the [release limitations and exception policy](https://github.com/ansible/ansible-backstage-plugins/blob/main/scripts/sdk-package-validation/PUBLISHING.md#reviewing-dependency-exceptions)
and the [current dependency decisions](https://github.com/ansible/ansible-backstage-plugins/blob/main/scripts/sdk-package-validation/audit-exceptions.json)
for affected versions, usage restrictions and expiry before using it in a host.

For host setup and contribution contracts, see the [Portal SDK author guide](https://github.com/ansible/ansible-backstage-plugins/blob/main/docs/next/portal-sdk-plugin-author-guide.md).
