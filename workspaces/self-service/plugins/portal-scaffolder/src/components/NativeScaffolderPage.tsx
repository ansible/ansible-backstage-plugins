import { lazy, Suspense } from 'react';
import { Progress } from '@backstage/core-components';
import { Route, Routes } from 'react-router-dom';
import { RequirePermission } from '@backstage/plugin-permission-react';
import {
  templatesViewPermission,
  executionEnvironmentsViewPermission,
} from '@ansible/backstage-rhaap-common/permissions';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';
import type { ScaffolderFieldDescriptor } from '@ansible/portal-extension-api/alpha';
import { NativeScaffolderFields } from '@ansible/portal-extension-host/alpha';
import { CreateTask } from './CreateTask/CreateTask';
import { formExtraFields } from './CreateTask/formExtraFields';
import { TemplatesRoutesPage } from './Home';
import { HistoryRoutesPage } from './TaskList';
import { CatalogImport } from './CatalogImport';
import { RequireSuperuser } from './CatalogImport/RequireSuperuser';

const EEDetailsPage = lazy(() =>
  import('./ExecutionEnvironments/catalog/EEDetailsPage').then(module => ({
    default: module.EEDetailsPage,
  })),
);

const reservedNames = formExtraFields.map(field => field.name);

export function NativeScaffolderPage({
  declarations,
}: {
  declarations: readonly ScaffolderFieldDescriptor[];
}) {
  return (
    <Routes>
      <Route
        path="catalog/:templateName"
        element={
          <RequirePermission permission={executionEnvironmentsViewPermission}>
            <Suspense fallback={<Progress />}>
              <EEDetailsPage />
            </Suspense>
          </RequirePermission>
        }
      />
      <Route
        path="catalog-import"
        element={
          <RequirePermission permission={catalogEntityCreatePermission}>
            <RequireSuperuser>
              <CatalogImport />
            </RequireSuperuser>
          </RequirePermission>
        }
      />
      <Route
        path="create/templates/:namespace/:templateName"
        element={
          <RequirePermission permission={templatesViewPermission}>
            <NativeScaffolderFields
              declarations={declarations}
              reservedNames={reservedNames}
            >
              {fields => <CreateTask nativeFields={fields} />}
            </NativeScaffolderFields>
          </RequirePermission>
        }
      />
      <Route path="create/tasks/*" element={<HistoryRoutesPage />} />
      <Route path="*" element={<TemplatesRoutesPage />} />
    </Routes>
  );
}
