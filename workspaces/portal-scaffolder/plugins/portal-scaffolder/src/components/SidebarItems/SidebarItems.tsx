import type { BasicPermission } from '@backstage/plugin-permission-common';
import { usePermission } from '@backstage/plugin-permission-react';
import { configApiRef, useApi, useRouteRef } from '@backstage/core-plugin-api';
import { SidebarItem } from '@backstage/core-components';
import BuildIcon from '@material-ui/icons/Build';
import HomeIcon from '@material-ui/icons/Home';
import ExtensionIcon from '@material-ui/icons/Extension';
import GitHubIcon from '@material-ui/icons/GitHub';
import HistoryIcon from '@material-ui/icons/History';
import {
  executionEnvironmentsViewPermission,
  collectionsViewPermission,
  gitRepositoriesViewPermission,
  templatesViewPermission,
  historyViewPermission,
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

export const TemplatesSidebarItem = () => {
  const rootLink = useRouteRef(rootRouteRef);

  return (
    <PermissionGatedSidebarItem
      permission={templatesViewPermission}
      icon={HomeIcon}
      to={`${rootLink()}/catalog`}
      text="Templates"
    />
  );
};

export const HistorySidebarItem = () => {
  const rootLink = useRouteRef(rootRouteRef);

  return (
    <PermissionGatedSidebarItem
      permission={historyViewPermission}
      icon={HistoryIcon}
      to={`${rootLink()}/create/tasks`}
      text="History"
    />
  );
};
