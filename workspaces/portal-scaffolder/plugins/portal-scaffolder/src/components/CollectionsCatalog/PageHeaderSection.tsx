import { CatalogSyncHeader, CatalogSyncHeaderProps } from '../common';
import { COLLECTION_TOOLTIP, COLLECTION_DESCRIPTION } from './constants';

export type PageHeaderSectionProps = Omit<
  CatalogSyncHeaderProps,
  'title' | 'tooltip' | 'description'
>;

export const PageHeaderSection = ({
  onSyncClick,
  syncDisabled = false,
  syncDisabledReason,
  syncInProgress = false,
  syncProgress,
}: PageHeaderSectionProps) => (
  <CatalogSyncHeader
    title="Collections"
    tooltip={COLLECTION_TOOLTIP}
    description={COLLECTION_DESCRIPTION}
    onSyncClick={onSyncClick}
    syncDisabled={syncDisabled}
    syncDisabledReason={syncDisabledReason}
    syncInProgress={syncInProgress}
    syncProgress={syncProgress}
  />
);
