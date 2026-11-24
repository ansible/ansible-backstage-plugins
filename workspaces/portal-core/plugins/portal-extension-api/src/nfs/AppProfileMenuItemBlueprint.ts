import type { ApiHolder } from '@backstage/core-plugin-api';
import {
  createExtensionBlueprint,
  createExtensionDataRef,
} from '@backstage/frontend-plugin-api';
import type { PermissionRequirement } from '@ansible/portal-extension-common';
import { PORTAL_CONTRIBUTIONS_ATTACHMENT } from './contributions';

/** Frontend interaction only. Backend effects still require registered operations. */
export type AppProfileMenuAction = (context: {
  apis: ApiHolder;
}) => void | Promise<void>;

export type AppProfileMenuItemParams = {
  title: string;
  order?: number;
  enabledByConfig?: string;
  authorization:
    | { type: 'authenticated' }
    | { type: 'permission'; requirement: PermissionRequirement };
} & (
  | { type: 'navigation'; targetPage: string }
  | { type: 'action'; loadAction: () => Promise<AppProfileMenuAction> }
);

export type AppProfileMenuItemDescriptor = AppProfileMenuItemParams & {
  id: string;
  ownerPlugin: string;
};

export type ResolvedAppProfileMenuItem = {
  readonly id: string;
  readonly title: string;
} & (
  | { readonly type: 'navigation'; readonly path: string }
  | {
      readonly type: 'action';
      readonly activate: (beforeActivate?: () => void) => Promise<void>;
    }
);

export const appProfileMenuItemDataRef =
  createExtensionDataRef<AppProfileMenuItemDescriptor>().with({
    id: 'ansible.portal.app-profile-menu-item.v1',
  });

/** The host owns rows, routing, eligibility and failure presentation. */
export const AppProfileMenuItemBlueprint = createExtensionBlueprint({
  kind: 'app-profile-menu-item',
  attachTo: {
    id: PORTAL_CONTRIBUTIONS_ATTACHMENT,
    input: 'appProfileMenuItems',
  },
  output: [appProfileMenuItemDataRef],
  factory(params: AppProfileMenuItemParams, { node }) {
    return [
      appProfileMenuItemDataRef({
        ...params,
        id: node.spec.id,
        ownerPlugin: node.spec.plugin.id,
      }),
    ];
  },
});
