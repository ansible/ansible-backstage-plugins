import { SidebarItem } from '@backstage/core-components';
import LibraryBooksIcon from '@material-ui/icons/LibraryBooks';

/** Sidebar entry for the content experience. Referenced by `menuItem` in dynamicRoutes. */
export const AutomationContentSidebarItem = () => (
  <SidebarItem icon={LibraryBooksIcon} to="automation-content" text="Content" />
);
