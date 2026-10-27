import { createCatalogModule } from '@ansible/backstage-plugin-catalog-backend-module-rhaap-shared';

export const catalogModuleAap = createCatalogModule({
  moduleId: 'aap',
  slice: 'aap',
});
