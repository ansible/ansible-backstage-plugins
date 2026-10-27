import { createCatalogModule } from '@ansible/backstage-plugin-catalog-backend-module-rhaap-shared';

export const catalogModuleInterimContent = createCatalogModule({
  moduleId: 'interim-content',
  slice: 'content',
});
