import {
  createExtensionBlueprint,
  createExtensionDataRef,
} from '@backstage/frontend-plugin-api';
import type { PermissionRequirement } from '@ansible/portal-extension-common';
import { PORTAL_CONTRIBUTIONS_ATTACHMENT } from './contributions';

/** UI-only navigation to an owned page; never a backend launch or arbitrary URL. */
export interface AppHeaderActionDescriptor {
  /** Bound to the actual NFS extension and plugin by the collector. */
  id: string;
  ownerPlugin: string;
  group: 'create';
  title: string;
  targetPage: string;
  requiredPermission: PermissionRequirement;
  order?: number;
  enabledByConfig?: string;
}

export interface ResolvedAppHeaderAction {
  readonly id: string;
  readonly title: string;
  readonly path: string;
}

export const appHeaderActionDataRef =
  createExtensionDataRef<AppHeaderActionDescriptor>().with({
    id: 'ansible.portal.app-header-action.v1',
  });

/** Plugins declare destinations; the host owns grouping, routing and visibility. */
export const AppHeaderActionBlueprint = createExtensionBlueprint({
  kind: 'app-header-action',
  attachTo: { id: PORTAL_CONTRIBUTIONS_ATTACHMENT, input: 'appHeaderActions' },
  output: [appHeaderActionDataRef],
  factory(
    params: Omit<AppHeaderActionDescriptor, 'id' | 'ownerPlugin'>,
    { node },
  ) {
    return [
      appHeaderActionDataRef({
        ...params,
        id: node.spec.id,
        ownerPlugin: node.spec.plugin.id,
      }),
    ];
  },
});
