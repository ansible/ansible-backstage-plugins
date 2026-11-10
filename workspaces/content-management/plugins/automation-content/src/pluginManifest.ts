import {
  CONTENT_TYPES,
  type PluginManifest,
} from '@ansible/portal-extension-api';

/** Native catalog contributions owned by the automation content plugin. */
export const automationContentManifest: PluginManifest = {
  id: 'automation-content',
  version: '1.0.0',
  apiVersion: '0.1.0',
  entitlements: [],
  capabilities: [
    {
      id: 'automation-content.discovery',
      ownerPlugin: 'automation-content',
      displayName: 'Automation Content Discovery',
      description:
        'Discover execution environment images in the content catalog.',
      appliesToContentTypes: [CONTENT_TYPES.EXECUTION_ENVIRONMENT_IMAGE],
      minimumHostApiVersion: '0.1.0',
      entryPoints: [
        {
          id: 'automation-content.discovery.images-tab',
          kind: 'page-tab',
          surface: 'experience-slot',
          appliesToContentTypes: [CONTENT_TYPES.EXECUTION_ENVIRONMENT_IMAGE],
          label: 'Images',
          order: 0,
          launches: { type: 'slot', targetSlot: 'catalog.tabs' },
        },
      ],
    },
  ],
};
