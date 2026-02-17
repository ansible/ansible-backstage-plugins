/*
 * Copyright 2024 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';

import { PolicyBuilder } from './service/policy-builder';
import {
  PluginIdProvider,
  PluginIdProviderExtensionPoint,
  pluginIdProviderExtensionPoint,
  RBACProvider,
  rbacProviderExtensionPoint,
} from '@backstage-community/plugin-rbac-node';

import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';
import {
  ansibleServiceRef,
  AAPTokenLookup,
} from '@ansible/backstage-rhaap-common';
import { DatabaseManager } from '@backstage/backend-defaults/database';

/**
 * @public
 * RBAC plugin
 *
 */
export const rbacPlugin = createBackendModule({
  pluginId: 'permission',
  moduleId: 'rbac',
  register(env) {
    const pluginIdProviderExtensionPointImpl = new (class PluginIdProviderImpl
      implements PluginIdProviderExtensionPoint
    {
      pluginIdProviders: PluginIdProvider[] = [];

      addPluginIdProvider(pluginIdProvider: PluginIdProvider): void {
        this.pluginIdProviders.push(pluginIdProvider);
      }
    })();

    env.registerExtensionPoint(
      pluginIdProviderExtensionPoint,
      pluginIdProviderExtensionPointImpl,
    );

    const rbacProviders = new Array<RBACProvider>();

    env.registerExtensionPoint(rbacProviderExtensionPoint, {
      addRBACProvider(
        ...providers: Array<RBACProvider | Array<RBACProvider>>
      ): void {
        rbacProviders.push(...providers.flat());
      },
    });

    env.registerInit({
      deps: {
        http: coreServices.httpRouter,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        discovery: coreServices.discovery,
        permissions: coreServices.permissions,
        auth: coreServices.auth,
        httpAuth: coreServices.httpAuth,
        auditor: coreServices.auditor,
        userInfo: coreServices.userInfo,
        lifecycle: coreServices.lifecycle,
        permissionsRegistry: coreServices.permissionsRegistry,
        policy: policyExtensionPoint,
        // ANSIBLE ENHANCEMENT: Add AAP service for external RBAC checks
        ansibleService: ansibleServiceRef,
      },
      async init({
        http,
        config,
        logger,
        discovery,
        permissions,
        auth,
        httpAuth,
        auditor,
        lifecycle,
        permissionsRegistry: permissionsRegistry,
        policy,
        ansibleService,
      }) {
        // ANSIBLE ENHANCEMENT: Create AAP token lookup service
        logger.info('[RBAC-Ansible] Initializing AAP token lookup for external RBAC checks');
        const databaseManager = DatabaseManager.fromConfig(config);
        const authDatabase = databaseManager.forPlugin('auth', { logger, lifecycle });
        const aapTokenLookup = await AAPTokenLookup.create({
          database: authDatabase,
          logger,
        });
        logger.info('[RBAC-Ansible] ✅ AAP token lookup service created');
        http.use(
          await PolicyBuilder.build(
            {
              config,
              logger,
              discovery,
              permissions,
              auth,
              httpAuth,
              auditor,
              lifecycle,
              permissionsRegistry: permissionsRegistry,
              policy,
              // ANSIBLE ENHANCEMENT: Pass AAP services for external RBAC
              aapService: ansibleService,
              aapTokenLookup,
            },
            {
              getPluginIds: () =>
                Array.from(
                  new Set(
                    pluginIdProviderExtensionPointImpl.pluginIdProviders.flatMap(
                      p => p.getPluginIds(),
                    ),
                  ),
                ),
            },
            rbacProviders,
          ),
        );
      },
    });
  },
});
