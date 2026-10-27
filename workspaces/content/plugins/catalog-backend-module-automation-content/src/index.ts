export { catalogModuleAutomationContent as default } from './module';
export {
  OCIRegistryEntityProvider,
  Annotations,
} from './OCIRegistryEntityProvider';
export type { OCIRegistryEntityProviderOptions } from './OCIRegistryEntityProvider';
// `registryUrlError` is the one rule for judging a registry URL, and it is
// shared by two places on purpose: the code that reads configuration when the
// backend starts, and the API endpoint that lets a user test a configuration
// before installing it. One shared rule means the two can never give
// different answers about the same URL.
export { readRegistryConfigs, registryUrlError } from './config';
export type { RegistryProviderEntry } from './config';
export { defaultContentTypes } from './contentTypes';
