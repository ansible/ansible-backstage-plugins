import { usePermission } from '@backstage/plugin-permission-react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { SidebarItem } from '@backstage/core-components';
import BuildIcon from '@material-ui/icons/Build';
import { eeBuilderReadPermission } from '@ansible/backstage-rhaap-common/permissions';

export const EEBuilderSidebarItem = () => {
  const { loading, allowed } = usePermission({
    permission: eeBuilderReadPermission,
  });

  const config = useApi(configApiRef);
  const isPermissionFrameworkEnabled =
    config.getOptionalBoolean('permission.enabled');

  if (!isPermissionFrameworkEnabled) {
    return (
      <SidebarItem
        icon={BuildIcon}
        to="/self-service/ee"
        text="EE Definitions"
      />
    );
  }

  if (loading || !allowed) {
    return null;
  }

  return (
    <SidebarItem icon={BuildIcon} to="/self-service/ee" text="EE Definitions" />
  );
};
