import { Route, Routes } from 'react-router-dom';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { templatesViewPermission } from '@ansible/aap-common/permissions';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';
import type { ScaffolderFieldDescriptor } from '@ansible/portal-extension-api/alpha';
import { NativeScaffolderFields } from '@ansible/portal-extension-host/alpha';
import { CreateTask } from './CreateTask/CreateTask';
import { formExtraFields } from './CreateTask/formExtraFields';
import { TemplatesRoutesPage } from './Home';
import { HistoryRoutesPage } from './TaskList';
import { CatalogImport } from './CatalogImport';
import { RequireSuperuser } from './CatalogImport/RequireSuperuser';
import {
  LegacyDefinitionRedirect,
  LegacyEERedirects,
} from './LegacyEERedirects';

const reservedNames = formExtraFields.map(field => field.name);

/** Render the native scaffolder with host-provided fields, APIs and notification boundaries. */
export function NativeScaffolderPage({
  declarations,
}: Readonly<{
  declarations: readonly ScaffolderFieldDescriptor[];
}>) {
  return (
    <Routes>
      <Route path="ee/*" element={<LegacyEERedirects />} />
      <Route
        path="catalog/:templateName"
        element={<LegacyDefinitionRedirect />}
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
