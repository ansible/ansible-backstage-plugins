import { createCatalogModule } from '@ansible/backstage-rhaap-common/catalog';

export const catalogModuleContent = createCatalogModule({
  moduleId: 'content',
  slice: 'content',
});
