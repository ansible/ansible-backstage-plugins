import { useRouteRef } from '@backstage/core-plugin-api';
import GitHubIcon from '@material-ui/icons/GitHub';
import { gitRepositoriesViewPermission } from '@ansible/backstage-rhaap-common/permissions';

import { rootRouteRef } from '../../routes';
import { PermissionGatedSidebarItem } from '../PermissionGatedSidebarItem';

export const GitRepositoriesSidebarItem = () => {
  const rootLink = useRouteRef(rootRouteRef);

  return (
    <PermissionGatedSidebarItem
      permission={gitRepositoriesViewPermission}
      icon={GitHubIcon}
      to={`${rootLink()}/repositories`}
      text="Git Repositories"
    />
  );
};
