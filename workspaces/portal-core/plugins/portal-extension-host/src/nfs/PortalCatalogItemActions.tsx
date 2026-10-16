import type {
  CatalogItemActionDescriptor,
  EntityContributionContext,
} from '@ansible/portal-extension-api/alpha';
import { stringifyEntityRef } from '@backstage/catalog-model';
import {
  useEligibleContributions,
  type EntitlementCheck,
} from './useEligibleContributions';
import { DEFAULT_EXPERIENCES } from './PortalEntityTabs';
import { PortalOperationAction } from './PortalEntityActions';
import { ErrorBoundary } from '../ErrorBoundary';
import { ContributionWrapper } from '../ContributionWrapper';

const noFollowOn = () => {};

export function PortalCatalogItemActions({
  actions,
  context,
  checkEntitlement,
  availableExperiences = DEFAULT_EXPERIENCES,
  presentation,
  onSubjectRemoved,
}: {
  actions: readonly CatalogItemActionDescriptor[];
  context: EntityContributionContext;
  checkEntitlement?: EntitlementCheck;
  availableExperiences?: readonly string[];
  presentation?: 'button' | 'menu-item';
  onSubjectRemoved?: () => void;
}) {
  const eligible = useEligibleContributions(
    actions,
    context,
    availableExperiences,
    checkEntitlement,
  );
  return (
    <div
      role="group"
      aria-label={`Actions for ${
        context.entity.metadata.title ?? context.entity.metadata.name
      }`}
    >
      {eligible?.map(action => (
        <ErrorBoundary
          key={`${stringifyEntityRef(context.entity)}:${action.entryPointId}`}
          contributionId={action.entryPointId}
        >
          <ContributionWrapper>
            <PortalOperationAction
              action={action}
              context={context}
              onSelect={noFollowOn}
              presentation={presentation}
              onSubjectRemoved={onSubjectRemoved}
            />
          </ContributionWrapper>
        </ErrorBoundary>
      ))}
    </div>
  );
}
