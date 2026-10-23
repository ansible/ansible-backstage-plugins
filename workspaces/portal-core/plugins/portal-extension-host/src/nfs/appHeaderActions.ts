import {
  coreExtensionData,
  type AppTreeApi,
} from '@backstage/frontend-plugin-api';
import type { AppHeaderActionDescriptor } from '@ansible/portal-extension-api/alpha';

function hasValidPermission(action: AppHeaderActionDescriptor): boolean {
  const requirement = action.requiredPermission;
  if ('permission' in requirement) {
    return Boolean(
      requirement.permission.name?.trim() && requirement.resourceRef?.trim(),
    );
  }
  return Boolean(requirement.name?.trim()) && !('resourceType' in requirement);
}

function hasOwnedPageReference(action: AppHeaderActionDescriptor): boolean {
  const prefix = `page:${action.ownerPlugin}`;
  return (
    /^page:[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)?$/i.test(action.targetPage) &&
    (action.targetPage === prefix || action.targetPage.startsWith(`${prefix}/`))
  );
}

function hasValidPresentation(action: AppHeaderActionDescriptor): boolean {
  return (
    action.group === 'create' &&
    Boolean(action.title.trim()) &&
    (action.order === undefined || Number.isFinite(action.order)) &&
    (action.enabledByConfig === undefined ||
      (typeof action.enabledByConfig === 'string' &&
        /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/i.test(action.enabledByConfig)))
  );
}

/** Validate shell navigation separately from content-scoped capability launches. */
export function collectAppHeaderActions(
  actions: readonly AppHeaderActionDescriptor[],
) {
  const seen = new Set<string>();
  return actions
    .filter(action => {
      try {
        if (
          !action.id.startsWith(`app-header-action:${action.ownerPlugin}/`) ||
          !hasValidPresentation(action) ||
          !hasOwnedPageReference(action) ||
          !hasValidPermission(action) ||
          seen.has(action.id)
        )
          return false;
        seen.add(action.id);
        return true;
      } catch {
        return false;
      }
    })
    .sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id),
    );
}

/** Only mounted, owned pages with safe effective routes can be header destinations. */
export function resolveAppHeaderActionPath(
  action: AppHeaderActionDescriptor,
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
