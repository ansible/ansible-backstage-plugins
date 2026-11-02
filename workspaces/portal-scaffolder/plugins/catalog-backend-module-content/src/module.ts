import { createCatalogModule } from '@ansible/backstage-plugin-catalog-backend-module-rhaap-shared';

export const catalogModuleContent = createCatalogModule({
  moduleId: 'content',
  slice: 'content',
});
