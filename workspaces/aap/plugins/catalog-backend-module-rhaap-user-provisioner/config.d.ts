// This plugin reads from config paths already declared by other plugins:
//   - ansible.rhaap.baseUrl  — declared in @ansible/aap-node
//   - catalog.providers.rhaap[env].orgs — declared in @ansible/backstage-plugin-catalog-backend-module-rhaap
// No additional config schema declarations are needed here.
export interface Config {}
