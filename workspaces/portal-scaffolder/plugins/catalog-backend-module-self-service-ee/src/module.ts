import { createCatalogModule } from '@ansible/backstage-plugin-catalog-backend-module-rhaap-shared';

export const catalogModuleSelfServiceEe = createCatalogModule({
  moduleId: 'self-service-ee',
  slice: 'ee',
});
