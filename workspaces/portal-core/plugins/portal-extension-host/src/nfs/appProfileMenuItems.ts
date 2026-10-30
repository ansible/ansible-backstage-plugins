import type { AppProfileMenuItemDescriptor } from '@ansible/portal-extension-api/alpha';
import {
  hasOwnedPageReference,
  hasValidPermission,
} from './profileMenuTargets';

/** Validation never imports a contribution's action implementation. */
export function collectAppProfileMenuItems(
  items: readonly AppProfileMenuItemDescriptor[],
) {
  const seen = new Set<string>();
  return items
    .filter(item => {
      try {
        const validAuthorization =
          item.authorization.type === 'authenticated' ||
          (item.authorization.type === 'permission' &&
            hasValidPermission({
              requiredPermission: item.authorization.requirement,
            }));
        const validTarget =
          item.type === 'navigation'
            ? hasOwnedPageReference(item)
            : item.type === 'action' && typeof item.loadAction === 'function';
        if (
          !item.id.startsWith(`app-profile-menu-item:${item.ownerPlugin}/`) ||
          !item.title.trim() ||
          !validAuthorization ||
          !validTarget ||
          seen.has(item.id) ||
          (item.order !== undefined && !Number.isFinite(item.order)) ||
          (item.enabledByConfig !== undefined &&
            (typeof item.enabledByConfig !== 'string' ||
              !/^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/i.test(item.enabledByConfig)))
        )
          return false;
        seen.add(item.id);
        return true;
      } catch {
        return false;
      }
    })
    .sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id),
    );
}
