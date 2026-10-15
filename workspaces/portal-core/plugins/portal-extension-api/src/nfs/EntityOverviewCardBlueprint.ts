import {
  createExtensionBlueprint,
  createExtensionDataRef,
} from '@backstage/frontend-plugin-api';
import type {
  EntityContributionContext,
  EntityDetailTabDescriptor,
} from './EntityDetailTabBlueprint';
import { PORTAL_CONTRIBUTIONS_ATTACHMENT } from './contributions';

export interface EntityOverviewCardContext extends EntityContributionContext {
  /** UI-only navigation to the card's declared, eligible entity-tab destination. */
  openDetails?: () => void;
}

export interface EntityOverviewCardDescriptor
  extends Omit<EntityDetailTabDescriptor, 'attachment' | 'loader'> {
  attachment: 'entity.overview.main' | 'entity.overview.secondary';
  detailsEntryPointId?: string;
  loader: (context: EntityOverviewCardContext) => Promise<JSX.Element>;
}

export const entityOverviewCardDataRef =
  createExtensionDataRef<EntityOverviewCardDescriptor>().with({
    id: 'ansible.portal.entity-overview-card.v1',
  });

export const EntityOverviewCardBlueprint = createExtensionBlueprint({
  kind: 'entity-overview-card',
  attachTo: {
    id: PORTAL_CONTRIBUTIONS_ATTACHMENT,
    input: 'entityOverviewCards',
  },
  output: [entityOverviewCardDataRef],
  factory(params: EntityOverviewCardDescriptor, { node }) {
    return [
      entityOverviewCardDataRef({
        ...params,
        manifest: { ...params.manifest, id: node.spec.plugin.id },
      }),
    ];
  },
});
