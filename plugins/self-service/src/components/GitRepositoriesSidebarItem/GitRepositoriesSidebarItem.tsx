import { usePermission } from '@backstage/plugin-permission-react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { SidebarItem } from '@backstage/core-components';
import GitHubIcon from '@material-ui/icons/GitHub';
import { gitRepositoriesViewPermission } from '@ansible/backstage-rhaap-common/permissions';

export const GitRepositoriesSidebarItem = () => {
  const { loading, allowed } = usePermission({
    permission: gitRepositoriesViewPermission,
  });

  const config = useApi(configApiRef);
  const isPermissionFrameworkEnabled =
    config.getOptionalBoolean('permission.enabled');

  if (!isPermissionFrameworkEnabled) {
    return (
      <SidebarItem
        icon={GitHubIcon}
        to="/self-service/repositories"
        text="Git Repositories"
      />
    );
  }

  if (loading || !allowed) {
    return null;
  }

  return (
    <SidebarItem
      icon={GitHubIcon}
      to="/self-service/repositories"
      text="Git Repositories"
    />
  );
};
