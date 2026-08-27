import type { BasicPermission } from '@backstage/plugin-permission-common';
import { usePermission } from '@backstage/plugin-permission-react';
import { configApiRef, useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  SidebarItem,
  SidebarSubmenu,
  SidebarSubmenuItem,
} from '@backstage/core-components';
import BuildIcon from '@material-ui/icons/Build';
import HomeIcon from '@material-ui/icons/Home';
import ExtensionIcon from '@material-ui/icons/Extension';
import GitHubIcon from '@material-ui/icons/GitHub';
import HistoryIcon from '@material-ui/icons/History';
import FolderIcon from '@material-ui/icons/Folder';
import AssessmentIcon from '@material-ui/icons/Assessment';
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
      to={`${rootLink()}/repositories/catalog`}
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

export const ContentQualitySidebarItem = () => {
  const rootLink = useRouteRef(rootRouteRef);

  return (
    <PermissionGatedSidebarItem
      permission={gitRepositoriesViewPermission}
      icon={AssessmentIcon}
      to={`${rootLink()}/content-quality`}
      text="Content quality"
    />
  );
};

export const ContentSidebarGroup = () => {
  const config = useApi(configApiRef);
  const rootLink = useRouteRef(rootRouteRef);
  const isApmeEnabled = config.getOptionalBoolean('ansible.apme.enabled');

  const { loading: gitRepoLoading, allowed: gitRepoAllowed } = usePermission({
    permission: gitRepositoriesViewPermission,
  });
  const isPermissionFrameworkEnabled =
    config.getOptionalBoolean('permission.enabled');

  const canViewGitRepos = !isPermissionFrameworkEnabled || gitRepoAllowed;
  const isLoading = isPermissionFrameworkEnabled && gitRepoLoading;

  if (isLoading || !canViewGitRepos) {
    return null;
  }

  if (!isApmeEnabled) {
    return <GitRepositoriesSidebarItem />;
  }

  return (
    <SidebarItem icon={FolderIcon} text="Content">
      <SidebarSubmenu title="Content">
        <SidebarSubmenuItem
          title="Git Repositories"
          to={`${rootLink()}/repositories/catalog`}
          icon={GitHubIcon}
        />
        <SidebarSubmenuItem
          title="Content quality"
          to={`${rootLink()}/content-quality`}
          icon={AssessmentIcon}
        />
      </SidebarSubmenu>
    </SidebarItem>
  );
};
