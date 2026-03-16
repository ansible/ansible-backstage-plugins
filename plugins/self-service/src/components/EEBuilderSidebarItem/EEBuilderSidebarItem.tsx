import { usePermission } from '@backstage/plugin-permission-react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { SidebarItem } from '@backstage/core-components';
import BuildIcon from '@material-ui/icons/Build';
import { executionEnvironmentsViewPermission } from '@ansible/backstage-rhaap-common/permissions';

export const EEBuilderSidebarItem = () => {
  const { loading, allowed } = usePermission({
    permission: executionEnvironmentsViewPermission,
  });

  const config = useApi(configApiRef);
  const isPermissionFrameworkEnabled =
    config.getOptionalBoolean('permission.enabled');

  if (!isPermissionFrameworkEnabled) {
    return (
      <SidebarItem
        icon={BuildIcon}
        to="/self-service/ee"
        text="Execution Environments"
      />
    );
  }

  if (loading || !allowed) {
    return null;
  }

  return (
    <SidebarItem
      icon={BuildIcon}
      to="/self-service/ee"
      text="Execution Environments"
    />
  );
};
