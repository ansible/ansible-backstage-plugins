import { catalogEntityPermissionResourceRef } from '@backstage/plugin-catalog-node/alpha';
import { createPermissionRule } from '@backstage/plugin-permission-node';
import { z } from 'zod';
import type { ZodType } from 'zod';
import { executePermissionStore } from './executePermissionStore';

const paramsSchema: ZodType = z.object({
  userEntityRef: z
    .string()
    .describe('Full user entity ref, e.g. user:default/network-user'),
});

// @ts-expect-error TS2589: ZodEffects schema triggers deep type recursion with createPermissionRule
export const hasExecutePermission = createPermissionRule({
  name: 'HAS_EXECUTE_PERMISSION',
  description:
    'Allow job template entities where the user has AAP execute permission',
  resourceRef: catalogEntityPermissionResourceRef,
  paramsSchema,
  apply: (
    resource: { metadata: { aapJobTemplateId?: number | string } },
    { userEntityRef }: { userEntityRef: string },
  ) => {
    const templateId = String(resource.metadata.aapJobTemplateId ?? '');
    if (!templateId) return true;
    const username = userEntityRef.split('/').pop() ?? '';
    return executePermissionStore.hasExecutePermission(username, templateId);
  },
  toQuery: ({ userEntityRef }: { userEntityRef: string }) => {
    const username = userEntityRef.split('/').pop() ?? '';
    const templateIds = executePermissionStore.getTemplateIdsForUser(username);
    if (templateIds.length === 0) {
      return { key: 'metadata.aapJobTemplateId', values: ['__none__'] };
    }
    return {
      key: 'metadata.aapJobTemplateId',
      values: templateIds,
    };
  },
});
