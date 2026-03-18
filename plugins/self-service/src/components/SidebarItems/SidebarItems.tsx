import type { BasicPermission } from '@backstage/plugin-permission-common';
import { usePermission } from '@backstage/plugin-permission-react';
import { configApiRef, useApi, useRouteRef } from '@backstage/core-plugin-api';
import { SidebarItem } from '@backstage/core-components';
import BuildIcon from '@material-ui/icons/Build';
import ExtensionIcon from '@material-ui/icons/Extension';
import GitHubIcon from '@material-ui/icons/GitHub';
import {
  executionEnvironmentsViewPermission,
  collectionsViewPermission,
  gitRepositoriesViewPermission,
} from '@ansible/backstage-rhaap-common/permissions';

import { rootRouteRef } from '../../routes';

interface PermissionGatedSidebarItemProps {
  permission: BasicPermission;
  icon: React.ComponentType<{}>;
  to: string;
  text: string;
}

export const PermissionGatedSidebarItem = ({
  permission,
  icon,
  to,
  text,
}: PermissionGatedSidebarItemProps) => {
  const { loading, allowed } = usePermission({ permission });
  const config = useApi(configApiRef);
  const isPermissionFrameworkEnabled =
    config.getOptionalBoolean('permission.enabled');

  if (!isPermissionFrameworkEnabled) {
    return <SidebarItem icon={icon} to={to} text={text} />;
  }

  if (loading || !allowed) {
    return null;
  }

  return <SidebarItem icon={icon} to={to} text={text} />;
};

export const EEBuilderSidebarItem = () => {
  const rootLink = useRouteRef(rootRouteRef);

  return (
    <PermissionGatedSidebarItem
      permission={executionEnvironmentsViewPermission}
      icon={BuildIcon}
      to={`${rootLink()}/ee`}
      text="Execution Environments"
    />
  );
};

export const CollectionsSidebarItem = () => {
  const rootLink = useRouteRef(rootRouteRef);

  return (
    <PermissionGatedSidebarItem
      permission={collectionsViewPermission}
      icon={ExtensionIcon}
      to={`${rootLink()}/collections`}
      text="Collections"
    />
  );
};

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
