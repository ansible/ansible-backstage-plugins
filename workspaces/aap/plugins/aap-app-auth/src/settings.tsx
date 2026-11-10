import type { ReactNode } from 'react';
import { configApiRef, useApi, useApiHolder } from '@backstage/core-plugin-api';
import {
  coreExtensionData,
  createExtension,
  createFrontendModule,
  type FrontendModule,
} from '@backstage/frontend-plugin-api';
import {
  DefaultProviderSettings,
  ProviderSettingsItem,
} from '@backstage/plugin-user-settings';
import { rhAapAuthApiRef } from './api';

/** Provider-session controls only. Full Portal logout belongs to the host. */
export function AapProviderSettings() {
  const apis = useApiHolder();
  if (!apis.get(rhAapAuthApiRef)) {
    return (
      <li>
        <p role="alert">
          AAP authentication API is unavailable. Register it before enabling AAP
          Settings.
        </p>
      </li>
    );
  }
  return (
    <ProviderSettingsItem
      title="Ansible Automation Platform"
      description="Provides authentication towards Ansible Automation Platform APIs"
      apiRef={rhAapAuthApiRef}
      icon={null}
    />
  );
}

/** Supply existing custom rows when the host already customizes this list. */
export function AapProviderSettingsList({
  providerSettings,
}: { providerSettings?: ReactNode } = {}) {
  const config = useApi(configApiRef);
  const providers = config.getOptionalConfig('auth.providers')?.keys() ?? [];
  return (
    <>
      {providerSettings ?? (
        <DefaultProviderSettings configuredProviders={providers} />
      )}
      <AapProviderSettings />
    </>
  );
}

/** Opt-in adapter for the native user-settings provider-list singleton input. */
export function createAapSettingsModule({
  providerSettings,
}: { providerSettings?: ReactNode } = {}): FrontendModule {
  return createFrontendModule({
    pluginId: 'user-settings',
    extensions: [
      createExtension({
        kind: 'auth-provider-settings',
        name: 'rhaap',
        attachTo: {
          id: 'sub-page:user-settings/auth-providers',
          input: 'providerSettings',
        },
        output: [coreExtensionData.reactElement],
        factory: () => [
          coreExtensionData.reactElement(
            <AapProviderSettingsList providerSettings={providerSettings} />,
          ),
        ],
      }),
    ],
  });
}
