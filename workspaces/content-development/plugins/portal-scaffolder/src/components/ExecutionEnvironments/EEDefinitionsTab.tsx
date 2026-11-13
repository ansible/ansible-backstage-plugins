import { useNavigate } from 'react-router-dom';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { executionEnvironmentsViewPermission } from '@ansible/aap-common/permissions';
import { EENotificationBoundary } from './EENotificationBoundary';
import { EntityCatalogContent } from './catalog/CatalogContent';

import { eeTemplateCatalogPath } from '../../routes';

export function EEDefinitionsTab(): JSX.Element {
  const navigate = useNavigate();
  return (
    <RequirePermission permission={executionEnvironmentsViewPermission}>
      <EENotificationBoundary>
        <EntityCatalogContent
          onTabSwitch={() => navigate(eeTemplateCatalogPath)}
        />
      </EENotificationBoundary>
    </RequirePermission>
  );
}
