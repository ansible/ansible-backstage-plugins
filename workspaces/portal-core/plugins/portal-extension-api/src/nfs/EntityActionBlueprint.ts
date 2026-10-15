import {
  createExtensionBlueprint,
  createExtensionDataRef,
} from '@backstage/frontend-plugin-api';
import type { EntityDetailTabDescriptor } from './EntityDetailTabBlueprint';
import { PORTAL_CONTRIBUTIONS_ATTACHMENT } from './contributions';

/** Declarative operation action. No endpoint, component loader, or mutation callback. */
export interface EntityActionDescriptor
  extends Omit<EntityDetailTabDescriptor, 'attachment' | 'loader'> {
  attachment: 'entity.actions';
  /** Registered entity-tab entry to select after an accepted operation. */
  followOnEntryPointId?: string;
  confirmation?: { title: string; description: string; confirmLabel: string };
  /** Synchronous operation outcome; host owns navigation/cache invalidation. */
  completion?: 'subject-removed';
}

export const entityActionDataRef =
  createExtensionDataRef<EntityActionDescriptor>().with({
    id: 'ansible.portal.entity-action.v1',
  });

export const EntityActionBlueprint = createExtensionBlueprint({
  kind: 'entity-action',
  attachTo: { id: PORTAL_CONTRIBUTIONS_ATTACHMENT, input: 'entityActions' },
  output: [entityActionDataRef],
  factory(params: EntityActionDescriptor, { node }) {
    return [
      entityActionDataRef({
        ...params,
        manifest: { ...params.manifest, id: node.spec.plugin.id },
      }),
    ];
  },
});
