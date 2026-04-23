import {
  PageHeaderSection as GenericPageHeaderSection,
  PageHeaderSectionProps as GenericPageHeaderSectionProps,
} from '../common';
import { COLLECTION_TOOLTIP, COLLECTION_DESCRIPTION } from './constants';

export type PageHeaderSectionProps = Omit<
  GenericPageHeaderSectionProps,
  'title' | 'tooltip' | 'description'
>;

export const PageHeaderSection = ({
  onSyncClick,
  syncDisabled = false,
  syncDisabledReason,
  syncInProgress = false,
}: PageHeaderSectionProps) => (
  <GenericPageHeaderSection
    title="Collections"
    tooltip={COLLECTION_TOOLTIP}
    description={COLLECTION_DESCRIPTION}
    onSyncClick={onSyncClick}
    syncDisabled={syncDisabled}
    syncDisabledReason={syncDisabledReason}
    syncInProgress={syncInProgress}
  />
);
