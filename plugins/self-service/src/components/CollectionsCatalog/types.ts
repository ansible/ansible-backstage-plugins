import { Entity } from '@backstage/catalog-model';

export interface SyncStatus {
  lastSyncTime: string | null;
  lastFailedSyncTime: string | null;
}

export type SyncStatusMap = Record<string, SyncStatus>;

export type SourcesTree = Record<string, Record<string, string[]>>;

export interface SyncFilter {
  scmProvider?: string;
  hostName?: string;
  organization?: string;
}

export interface PageHeaderSectionProps {
  onSyncClick: () => void;
  syncDisabled?: boolean;
  syncDisabledReason?: string;
}

export interface StartedSyncInfo {
  sourceId: string;
  displayName: string;
  lastSyncTime: string | null;
}

export interface SyncDialogProps {
  open: boolean;
  onClose: () => void;
  onSyncsStarted?: (syncs: StartedSyncInfo[]) => void;
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
