import type {
  AuthService,
  DiscoveryService,
} from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';
import { createEEEntityLifecycleService } from '@ansible/content-development-common';
import { createEEDefinitionAction as createContentDevelopmentEEDefinitionAction } from '@ansible/plugin-scaffolder-backend-module-content-development';

/**
 * Compatibility factory for hosts that still register the legacy AAP module.
 * The action implementation lives in the content-development package.
 */
export function createEEDefinitionAction(options: {
  frontendUrl: string;
  auth: AuthService;
  discovery: DiscoveryService;
  config: Config;
}) {
  const { frontendUrl, auth, discovery, config } = options;
  const eeLifecycle = createEEEntityLifecycleService({ auth, discovery });

  return createContentDevelopmentEEDefinitionAction({
    frontendUrl,
    eeLifecycle,
    config,
  });
}
