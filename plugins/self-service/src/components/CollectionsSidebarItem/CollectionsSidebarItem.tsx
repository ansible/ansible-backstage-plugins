import { usePermission } from '@backstage/plugin-permission-react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { SidebarItem } from '@backstage/core-components';
import ExtensionIcon from '@material-ui/icons/Extension';
import { collectionsViewPermission } from '@ansible/backstage-rhaap-common/permissions';

export const CollectionsSidebarItem = () => {
  const { loading, allowed } = usePermission({
    permission: collectionsViewPermission,
  });

  const config = useApi(configApiRef);
  const isPermissionFrameworkEnabled =
    config.getOptionalBoolean('permission.enabled');

  if (!isPermissionFrameworkEnabled) {
    return (
      <SidebarItem
        icon={ExtensionIcon}
        to="/self-service/collections"
        text="Collections"
      />
    );
  }

  if (loading || !allowed) {
    return null;
  }

  return (
    <SidebarItem
      icon={ExtensionIcon}
      to="/self-service/collections"
      text="Collections"
    />
  );
};
