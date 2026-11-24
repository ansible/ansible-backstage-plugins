import {
  coreExtensionData,
  type AppTreeApi,
} from '@backstage/frontend-plugin-api';
import type { PermissionRequirement } from '@ansible/portal-extension-common';

type ProfilePageTarget = { ownerPlugin: string; targetPage: string };

export function hasValidPermission(action: {
  requiredPermission: PermissionRequirement;
}): boolean {
  const requirement = action.requiredPermission;
  if ('permission' in requirement) {
    return Boolean(
      requirement.permission.name?.trim() && requirement.resourceRef?.trim(),
    );
  }
  return Boolean(requirement.name?.trim()) && !('resourceType' in requirement);
}

export function hasOwnedPageReference(action: ProfilePageTarget): boolean {
  const prefix = `page:${action.ownerPlugin}`;
  return (
    /^page:[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)?$/i.test(action.targetPage) &&
    (action.targetPage === prefix || action.targetPage.startsWith(`${prefix}/`))
  );
}

/** Only mounted, owned pages with safe effective routes can be profile destinations. */
export function resolveProfileMenuPath(
  action: ProfilePageTarget,
  appTree: AppTreeApi,
) {
  const page = appTree.getTree().tree.nodes.get(action.targetPage);
  if (
    !page ||
    page.spec.plugin?.id !== action.ownerPlugin ||
    page.spec.disabled ||
    page.edges.attachedTo?.node.spec.id !== 'app/routes' ||
    page.edges.attachedTo.input !== 'routes'
  )
    return undefined;
  const path = page.instance?.getData(coreExtensionData.routePath);
  if (
    !path ||
    !/^\/[A-Za-z0-9_.~-]+(?:\/[A-Za-z0-9_.~-]+)*$/.test(path) ||
    path.split('/').some(segment => segment === '.' || segment === '..')
  )
    return undefined;
  return path;
}
