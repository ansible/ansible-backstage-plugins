import { createCatalogModule } from '@ansible/backstage-rhaap-common/catalog';
import { contentCatalogRegistration } from '@ansible/backstage-plugin-catalog-backend-module-content/contentCatalogRegistration';

export const catalogModuleRhaap = createCatalogModule({
  moduleId: 'rhaap',
  slice: 'all',
  deprecated: true,
  contentCatalogRegistration,
});
