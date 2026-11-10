import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/core-plugin-api';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { eeRouteRef } from '../../routes';
import { EntityCatalogContent } from './catalog/CatalogContent';
import { definitionFileHref } from './catalogHelpers';

/** Route integration seam for the prototype definition catalog. */
export function DefinitionFilesCatalogPage(): ReactElement {
  const navigate = useNavigate();
  const base = useRouteRef(eeRouteRef)();
  return (
    <EntityCatalogContent
      onTabSwitch={index =>
        navigate(`${base}/${['images', 'catalog', 'create'][index]}`)
      }
      getDefinitionFileHref={entity =>
        definitionFileHref(base, stringifyEntityRef(entity))
      }
    />
  );
}
