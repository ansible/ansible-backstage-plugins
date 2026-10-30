import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/core-plugin-api';
import { eeRouteRef } from '../../routes';
import { EntityCatalogContent } from './catalog/CatalogContent';

/** Route integration seam for the prototype definition catalog. */
export function DefinitionFilesCatalogPage(): ReactElement {
  const navigate = useNavigate();
  const base = useRouteRef(eeRouteRef)();
  return (
    <EntityCatalogContent
      onTabSwitch={index =>
        navigate(`${base}/${['images', 'catalog', 'create'][index]}`)
      }
    />
  );
}
