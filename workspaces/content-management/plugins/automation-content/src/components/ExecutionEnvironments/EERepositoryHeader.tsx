import { stringifyEntityRef } from '@backstage/catalog-model';
import {
  BreadcrumbEntry,
  useRouteRef,
  useTranslationRef,
} from '@backstage/frontend-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import type { EntityHeaderLayoutProps } from '@backstage/plugin-catalog-react/alpha';
import { Header } from '@backstage/ui';
import { useLocation } from 'react-router-dom';
import { eeRouteRef } from '../../routes';
import { eeTranslationRef } from '../../strings/en';
import { RepositoryFavoriteButton } from './RepositoryFavoriteButton';

export function EERepositoryHeader({
  tabs,
  activeTabId,
}: EntityHeaderLayoutProps): JSX.Element {
  const { entity } = useEntity();
  const { t } = useTranslationRef(eeTranslationRef);
  const images = useRouteRef(eeRouteRef);
  const { pathname } = useLocation();
  const title = entity.metadata.title ?? entity.metadata.name;
  const header = (
    <BreadcrumbEntry entry={{ label: title, href: pathname }}>
      <Header
        title={title}
        tabs={tabs.length > 1 ? tabs : undefined}
        activeTabId={activeTabId}
        customActions={
          <RepositoryFavoriteButton
            entityRef={stringifyEntityRef(entity)}
            repository={title}
          />
        }
      />
    </BreadcrumbEntry>
  );

  return images ? (
    <BreadcrumbEntry entry={{ label: t('detail.breadcrumb'), href: images() }}>
      {header}
    </BreadcrumbEntry>
  ) : (
    header
  );
}
