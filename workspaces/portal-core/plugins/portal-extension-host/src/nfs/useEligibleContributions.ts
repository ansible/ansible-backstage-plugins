import { useEffect, useState } from 'react';
import { configApiRef, useApiHolder } from '@backstage/core-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import type { EntitlementDefinition } from '@ansible/portal-extension-api';
import type {
  EntityContributionContext,
  EntityDetailTabDescriptor,
} from '@ansible/portal-extension-api/alpha';

export type ScopedContribution = Omit<
  EntityDetailTabDescriptor,
  'attachment' | 'loader'
>;
export type EntitlementCheck = (
  entitlement: EntitlementDefinition,
  context: EntityContributionContext,
) => boolean | Promise<boolean>;

export function resolveEntityContribution(contribution: ScopedContribution) {
  const capability = contribution.manifest.capabilities.find(
    item => item.id === contribution.capabilityId,
  );
  const entry = capability?.entryPoints.find(
    item => item.id === contribution.entryPointId,
  );
  return { capability, entry };
}

/** Shared gating for presentations; backend operation authorization remains independent. */
export function useEligibleContributions<T extends ScopedContribution>(
  declarations: readonly T[],
  context: EntityContributionContext,
  experiences: readonly string[],
  checkEntitlement?: EntitlementCheck,
) {
  const holder = useApiHolder();
  const config = holder.get(configApiRef);
  const permissions = holder.get(permissionApiRef);
  const [state, setState] = useState<{
    context: EntityContributionContext;
    declarations: readonly T[];
    experiences: readonly string[];
    checkEntitlement?: EntitlementCheck;
    eligible: T[];
  }>();
  useEffect(() => {
    let cancelled = false;
    async function evaluate() {
      const matches = await Promise.all(
        declarations.map(async contribution => {
          try {
            const { capability, entry } =
              resolveEntityContribution(contribution);
            if (
              !capability ||
              !entry ||
              !entry.appliesToContentTypes.includes(context.contentType) ||
              !experiences.includes(capability.experienceId) ||
              (contribution.appliesToSourceKinds &&
                !contribution.appliesToSourceKinds.some(source =>
                  context.sourceKinds?.includes(source),
                )) ||
              (contribution.enabledByConfig &&
                config?.getOptionalBoolean(contribution.enabledByConfig) !==
                  true)
            )
              return undefined;
            if (entry.requiredPermission) {
              const requirement = entry.requiredPermission;
              const response = await permissions?.authorize(
                'permission' in requirement
                  ? requirement
                  : { permission: requirement },
              );
              if (response?.result !== AuthorizeResult.ALLOW) return undefined;
            }
            for (const id of contribution.requiredEntitlements ?? []) {
              const entitlement = contribution.manifest.entitlements.find(
                item => item.id === id,
              );
              if (
                !entitlement ||
                !checkEntitlement ||
                !(await checkEntitlement(entitlement, context))
              )
                return undefined;
            }
            if (
              contribution.isApplicable &&
              !(await contribution.isApplicable(context))
            )
              return undefined;
            return { contribution };
          } catch (error) {
            // eslint-disable-next-line no-console
            console.warn(
              `[Portal NFS] Cannot activate ${contribution.entryPointId}`,
              error,
            );
            return undefined;
          }
        }),
      );
      if (!cancelled)
        setState({
          context,
          declarations,
          experiences,
          checkEntitlement,
          eligible: matches
            .filter((item): item is { contribution: T } => Boolean(item))
            .map(item => item.contribution),
        });
    }
    void evaluate();
    return () => {
      cancelled = true;
    };
  }, [
    declarations,
    context,
    experiences,
    checkEntitlement,
    config,
    permissions,
  ]);
  return state?.context === context &&
    state.declarations === declarations &&
    state.experiences === experiences &&
    state.checkEntitlement === checkEntitlement
    ? state.eligible
    : undefined;
}
