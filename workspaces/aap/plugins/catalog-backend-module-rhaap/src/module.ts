import { createCatalogModule } from '@ansible/backstage-plugin-catalog-backend-module-rhaap-shared';

export const catalogModuleRhaap = createCatalogModule({
  moduleId: 'rhaap',
  slice: 'all',
  deprecated: true,
});
