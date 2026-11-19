import { SidebarItem } from '@backstage/core-components';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';

/** Sidebar entry for the content experience. Referenced by `menuItem` in dynamicRoutes. */
export const AutomationContentSidebarItem = () => (
  <SidebarItem icon={LibraryBooksIcon} to="automation-content" text="Content" />
);
