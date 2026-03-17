import { useRouteRef } from '@backstage/core-plugin-api';
import BuildIcon from '@material-ui/icons/Build';
import { executionEnvironmentsViewPermission } from '@ansible/backstage-rhaap-common/permissions';

import { rootRouteRef } from '../../routes';
import { PermissionGatedSidebarItem } from '../PermissionGatedSidebarItem';

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
