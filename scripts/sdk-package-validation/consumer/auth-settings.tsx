import {
  AapProviderSettings,
  AapProviderSettingsList,
  createAapSettingsModule,
} from '@ansible/aap-app-auth/settings';
export const native = createAapSettingsModule();
export const custom = createAapSettingsModule({
  providerSettings: <li>Existing provider</li>,
});
export const row = <AapProviderSettings />;
export const legacyList = <AapProviderSettingsList />;
