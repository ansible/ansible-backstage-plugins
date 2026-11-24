/**
 * Re-export shim — extension point constants have moved to `@ansible/portal-extension-common`.
 *
 * Importing from `@ansible/portal-extension-api` continues to work unchanged.
 * Switch to `@ansible/portal-extension-common` directly when you need these
 * constants in a backend plugin that cannot depend on React.
 */
export {
  CONTENT_TYPES,
  EXTENSION_POINTS,
} from '@ansible/portal-extension-common';
export type {
  ContentTypeId,
  ExtensionPointId,
} from '@ansible/portal-extension-common';
