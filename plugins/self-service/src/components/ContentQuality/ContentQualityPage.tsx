import { Navigate } from 'react-router-dom';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { useRouteRef } from '@backstage/core-plugin-api';
import { gitRepositoriesViewPermission } from '@ansible/backstage-rhaap-common/permissions';
import { rootRouteRef } from '../../routes';
import { contentQualitySidebarPath } from '../SidebarItems/contentNav';

/**
 * Legacy /content-quality mount — same Git Repositories page with Quality tab selected.
 */
export const ContentQualityRedirect = () => {
  const rootLink = useRouteRef(rootRouteRef);
  return <Navigate to={contentQualitySidebarPath(rootLink())} replace />;
};

/** @deprecated Use Git Repositories → Quality tab; kept for dynamic-plugin route mounts. */
export const ContentQualityPage = ContentQualityRedirect;

export const ContentQualityRoutesPage = () => (
  <RequirePermission permission={gitRepositoriesViewPermission}>
    <ContentQualityRedirect />
  </RequirePermission>
);
