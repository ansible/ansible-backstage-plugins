import type { BasicPermission } from '@backstage/plugin-permission-common';
import { usePermission } from '@backstage/plugin-permission-react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { SidebarItem } from '@backstage/core-components';

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
