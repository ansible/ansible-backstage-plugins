export {
  automationContentPlugin,
  AutomationContentPage,
  AutomationContentEEPage,
  AutomationContentCollectionsPage,
} from './plugin';
export { AutomationContentSidebarItem } from './components/LegacyContentNavigation';
export { automationContentApiRef, AutomationContentClient } from './api';
export type {
  AutomationContentApi,
  ExecutionEnvironment,
  Collection,
  ContentItem,
  ContentItemSummary,
  Registry,
  RegistryCapabilities,
  Enumeration,
} from './api';
export { rootRouteRef } from './routes';
