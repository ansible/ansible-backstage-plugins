/***/
/**
 * The rhaap backend module for the catalog plugin.
 *
 * @packageDocumentation
 */

export { catalogModuleRhaap as default } from './module';
export {
  createCatalogModule,
  createRouter,
} from '@ansible/backstage-plugin-catalog-backend-module-rhaap-shared';
