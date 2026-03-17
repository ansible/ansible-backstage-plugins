import { useRouteRef } from '@backstage/core-plugin-api';
import ExtensionIcon from '@material-ui/icons/Extension';
import { collectionsViewPermission } from '@ansible/backstage-rhaap-common/permissions';

import { rootRouteRef } from '../../routes';
import { PermissionGatedSidebarItem } from '../PermissionGatedSidebarItem';

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
