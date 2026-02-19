import { Entity } from '@backstage/catalog-model';

export interface SourceSyncStatus {
  sourceId: string;
  lastSync: string | null;
  collectionsFound: number;
  newCollections: number;
  repositoriesFound: number;
  lastError?: string;
  env: string;
  scmProvider: string;
  hostName: string;
  organization: string;
}

export type SyncStatusMap = Record<string, string | null>;

export type SourcesTree = Record<string, Record<string, string[]>>;

export interface SyncFilter {
  scmProvider?: string;
  hostName?: string;
  organization?: string;
}

export interface PageHeaderSectionProps {
  onSyncClick: () => void;
  syncDisabled?: boolean;
}

export interface SyncDialogProps {
  open: boolean;
  onClose: () => void;
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
