import { createCatalogModule } from '@ansible/backstage-rhaap-common/catalog';

export const catalogModuleRhaap = createCatalogModule({
  moduleId: 'rhaap',
  slice: 'all',
  deprecated: true,
});
