import { Entity } from '@backstage/catalog-model';
import type { SyncStatusMap } from '../common';

export interface PageHeaderSectionProps {
  onSyncClick: () => void;
  syncDisabled?: boolean;
  syncDisabledReason?: string;
}

export interface CollectionCardProps {
  entity: Entity;
  onClick: (path: string) => void;
  isStarred: boolean;
  onToggleStar: (entity: Entity) => void;
  syncStatusMap: SyncStatusMap;
}

export interface CollectionDetailsPageProps {
  collectionName?: string;
}

export interface CollectionAboutCardProps {
  entity: Entity;
  lastSync: string | null;
  lastFailedSync: string | null;
  onViewSource: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export interface CollectionResourcesCardProps {
  entity: Entity;
}

export interface CollectionReadmeCardProps {
  readmeContent: string;
  isLoading?: boolean;
  isHtml?: boolean;
}

export interface CollectionBreadcrumbsProps {
  collectionName: string;
  onNavigateToCatalog: () => void;
}
