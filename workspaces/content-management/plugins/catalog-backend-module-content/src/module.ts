import { createCatalogModule } from '@ansible/backstage-rhaap-common/catalog';

import { contentCatalogRegistration } from './contentCatalogRegistration';

export const catalogModuleContent = createCatalogModule({
  moduleId: 'content',
  slice: 'content',
  contentCatalogRegistration,
});
