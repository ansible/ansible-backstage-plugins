import type { ReactElement } from 'react';
import { usePermission } from '@backstage/plugin-permission-react';
import { automationContentViewPermission } from '@ansible/automation-content-common/permissions';
import { SidebarItem } from '@backstage/core-components';
import LibraryBooksIcon from '@material-ui/icons/LibraryBooks';

/** Legacy host navigation adapter; catalog pages themselves use Backstage UI. */
export function AutomationContentSidebarItem(): ReactElement | null {
  const { allowed } = usePermission({
    permission: automationContentViewPermission,
  });
  if (!allowed) return null;
  return (
    <SidebarItem
      icon={LibraryBooksIcon}
      to="automation-content"
      text="Content"
    />
  );
}
