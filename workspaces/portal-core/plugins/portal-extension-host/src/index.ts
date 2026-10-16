/**
 * portal-extension-host
 *
 * Runtime host for portal plugin contributions. Provides:
 * - Per-contribution error isolation (`ErrorBoundary`)
 * - Rendering wrappers (`ExtensionTabContent`, `ExtensionCardContent`,
 *   `ExtensionActionMenuItem`, `useActionActivation`)
 * - Experience slots (`ExperienceCardSlot`, `ExperienceTabContent`)
 * - Manifest validation (`validateManifest`)
 * - Dynamic extension discovery (`DynamicExtensionDiscovery`)
 *
 * Plugins that render community contributions should depend on this package,
 * not on self-service or individual extension files.
 */

export { ErrorBoundary } from './ErrorBoundary';
export { ContributionWrapper, usePortalCssTokens } from './ContributionWrapper';
export {
  PortalHealthStatus,
  usePortalHealthStatus,
} from './PortalHealthStatus';
export { SettingsShell } from './SettingsShell';
export type {
  SettingsShellProps,
  SettingsLoader,
  SettingsSaver,
} from './SettingsShell';

export {
  ExtensionTabContent,
  ExtensionCardContent,
  ExtensionActionMenuItem,
  useActionActivation,
} from './ExtensionRenderer';

export { ExperienceCardSlot, ExperienceTabContent } from './ExperienceSlot';

export {
  DynamicExtensionDiscovery,
  useIsDynamicEnvironment,
  contributionRegistry,
} from './DynamicExtensionDiscovery';

export {
  validateManifest,
  type ManifestValidationResult,
} from './validateManifest';
export { ExtensionActionMenu } from './ExtensionActionMenu';
