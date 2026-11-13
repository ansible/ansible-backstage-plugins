import { lazy, Suspense, type ReactNode } from 'react';
import {
  coreExtensionData,
  createExtension,
  type ExtensionDefinition,
} from '@backstage/frontend-plugin-api';

const ProviderSettings = lazy(() =>
  import('../settings').then(module => ({
    default: module.AapProviderSettingsList,
  })),
);

/** Attach to the native Settings public provider-list input when present. */
export function createAapSettingsExtension({
  providerSettings,
}: { providerSettings?: ReactNode } = {}): ExtensionDefinition {
  return createExtension({
    kind: 'auth-provider-settings',
    name: 'rhaap',
    attachTo: {
      id: 'sub-page:user-settings/auth-providers',
      input: 'providerSettings',
    },
    output: [coreExtensionData.reactElement],
    factory: () => [
      coreExtensionData.reactElement(
        <Suspense fallback={null}>
          <ProviderSettings providerSettings={providerSettings} />
        </Suspense>,
      ),
    ],
  });
}
