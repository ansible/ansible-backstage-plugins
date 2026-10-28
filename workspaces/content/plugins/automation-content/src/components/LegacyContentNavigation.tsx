import type { ReactElement } from 'react';
import { SidebarItem } from '@backstage/core-components';
import LibraryBooksIcon from '@material-ui/icons/LibraryBooks';

/** Legacy host navigation adapter; catalog pages themselves use Backstage UI. */
export function AutomationContentSidebarItem(): ReactElement {
  return (
    <SidebarItem
      icon={LibraryBooksIcon}
      to="automation-content"
      text="Content"
    />
  );
}
