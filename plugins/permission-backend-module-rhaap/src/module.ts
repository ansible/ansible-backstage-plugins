import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import {
  rbacProviderExtensionPoint,
  type RBACProvider,
  type RBACProviderConnection,
} from '@backstage-community/plugin-rbac-node';
import type {
  PermissionInfo,
  RoleConditionalPolicyDecision,
} from '@backstage-community/plugin-rbac-common';
import type { ConditionalPolicyDecision } from '@backstage/plugin-permission-common';
import type { LoggerService } from '@backstage/backend-plugin-api';

const PROVIDER_NAME = 'aap-rbac-provider';
const ROLE = 'role:default/aap-user';

const PERMISSIONS: string[][] = [
  [ROLE, 'catalog-entity', 'read', 'allow'],
  [ROLE, 'scaffolder-template', 'read', 'allow'],
  [ROLE, 'scaffolder-action', 'use', 'allow'],
  [ROLE, 'scaffolder-task', 'read', 'allow'],
  [ROLE, 'scaffolder-task', 'create', 'allow'],
  [ROLE, 'scaffolder.task.create', 'create', 'allow'],
  [ROLE, 'scaffolder.task.cancel', 'use', 'allow'],
  [ROLE, 'ansible.templates.view', 'use', 'allow'],
  [ROLE, 'ansible.history.view', 'use', 'allow'],
];

function buildConditionalPolicy(): RoleConditionalPolicyDecision<PermissionInfo> {
  const decision: ConditionalPolicyDecision = {
    result: 'CONDITIONAL' as const,
    pluginId: 'catalog',
    resourceType: 'catalog-entity',
    conditions: {
      anyOf: [
        {
          rule: 'HAS_EXECUTE_PERMISSION',
          resourceType: 'catalog-entity',
          params: { userEntityRef: '$currentUser' },
        },
        {
          not: {
            rule: 'HAS_METADATA',
            resourceType: 'catalog-entity',
            params: { key: 'aapJobTemplateId' },
          },
        },
      ],
    },
  };

  return {
    ...decision,
    id: 0,
    roleEntityRef: ROLE,
    permissionMapping: [{ name: 'catalog.entity.read', action: 'read' }],
  };
}

/** @internal Exported for testing only */
export function formatNamespace(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63);
}

/** @internal Exported for testing only */
export function readOrgs(envConfig: {
  has(key: string): boolean;
  getString(key: string): string;
  getStringArray(key: string): string[];
}): string[] {
  if (!envConfig.has('orgs')) return [];
  try {
    return envConfig
      .getString('orgs')
      .split(',')
      .map(o => o.trim())
      .filter(o => o.length > 0);
  } catch {
    return envConfig
      .getStringArray('orgs')
      .map(o => o.trim())
      .filter(o => o.length > 0);
  }
}

/** @internal Exported for testing only */
export class AAPRBACProvider implements RBACProvider {
  private connection?: RBACProviderConnection;

  constructor(
    private readonly orgs: string[],
    private readonly logger: LoggerService,
  ) {}

  getProviderName(): string {
    return PROVIDER_NAME;
  }

  async connect(connection: RBACProviderConnection): Promise<void> {
    this.connection = connection;

    if (this.orgs.length <= 1) {
      this.logger.info(
        `[${PROVIDER_NAME}] Single-org or no orgs configured, skipping RBAC policy creation`,
      );
      return;
    }

    this.logger.info(
      `[${PROVIDER_NAME}] Multi-org enabled (${this.orgs.length} orgs), creating RBAC policy`,
    );

    const roles: string[][] = this.orgs.map(org => {
      const ns =
        org.toLowerCase() === 'default' ? 'aap-default' : formatNamespace(org);
      return [`group:${ns}/${ns}`, ROLE];
    });
    roles.push(['group:default/aap-admins', ROLE]);

    await connection.applyRoles(roles);
    await connection.applyPermissions(PERMISSIONS);
    await connection.applyConditionalPermissions([buildConditionalPolicy()]);

    this.logger.info(
      `[${PROVIDER_NAME}] Created ${ROLE} with ${roles.length} members and conditional visibility policy`,
    );
  }

  async refresh(): Promise<void> {
    if (!this.connection || this.orgs.length <= 1) return;
  }
}

export const permissionModuleAAPRbac = createBackendModule({
  pluginId: 'permission',
  moduleId: 'aap-rbac-provider',
  register(reg) {
    reg.registerInit({
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        rbacProviders: rbacProviderExtensionPoint,
      },
      async init({ config, logger, rbacProviders }) {
        let orgs: string[] = [];

        try {
          const rhaapConfig = config
            .getConfig('catalog')
            .getConfig('providers')
            .getConfig('rhaap');

          for (const envKey of rhaapConfig.keys()) {
            const envConfig = rhaapConfig.getConfig(envKey);
            orgs = readOrgs(envConfig);
            if (orgs.length > 0) break;
          }
        } catch {
          logger.info(
            `[${PROVIDER_NAME}] No catalog.providers.rhaap config found, skipping`,
          );
        }

        rbacProviders.addRBACProvider(new AAPRBACProvider(orgs, logger));
      },
    });
  },
});
