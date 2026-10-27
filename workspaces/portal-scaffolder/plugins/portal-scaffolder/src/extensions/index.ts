/**
 * Extension host shims for the self-service plugin.
 *
 * The runtime implementations live in `@ansible/portal-extension-host`.
 * These files are thin re-exports kept for backwards compatibility so that
 * existing relative imports (`../../extensions/ExtensionRenderer` etc.) continue
 * to work without changes while the host package is the single source of truth.
 *
 * Public surface (all forwarded from portal-extension-host):
 * - `ErrorBoundary` — per-contribution crash isolation
 * - `ExtensionRenderer` exports — `ExtensionTabContent`, `ExtensionCardContent`,
 *   `ExtensionActionMenuItem`, `useActionActivation`
 * - `ExperienceSlot` exports — `ExperienceCardSlot`, `ExperienceTabContent`
 * - `DynamicExtensionDiscovery` — Scalprum loader + no-op fallback
 * - `validateManifest` — host-side manifest validation
 */

export { ErrorBoundary } from './ErrorBoundary';

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
} from './DynamicExtensionDiscovery';

export {
  validateManifest,
  type ManifestValidationResult,
} from './validateManifest';
