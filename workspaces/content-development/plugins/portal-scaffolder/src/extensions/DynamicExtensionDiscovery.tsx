/**
 * Re-exports the portal-extension-host's DynamicExtensionDiscovery and
 * related utilities. Self-service uses the host package's implementation
 * directly; this shim exists only for backwards compatibility with any code
 * that imports from this path.
 *
 * For the self-service manifest wiring, see SelfServiceApp or the plugin
 * entry point where `<DynamicExtensionDiscovery manifests={[selfServiceManifest]} />`
 * is mounted.
 */
export {
  DynamicExtensionDiscovery,
  useIsDynamicEnvironment,
  contributionRegistry,
} from '@ansible/portal-extension-host';
