import type { ReactElement, ReactNode } from 'react';
import {
  PageHeader,
  SyncProgressPopover,
  useIsSuperuser,
  usePageHeaderStyles,
} from '@ansible/portal-plugin-sdk';
import type { SyncProgressEntry } from '@ansible/portal-plugin-sdk';
import { CatalogSyncButton } from './CatalogSyncButton';
import { LastSyncedTooltip } from './LastSyncedTooltip';

export interface CatalogSyncHeaderProps {
  title: string;
  tooltip: string;
  description: string;
  onSyncClick: () => void;
  syncDisabled?: boolean;
  /** Blocking explanation, or a busy fallback when detailed progress is unavailable. */
  syncDisabledReason?: string;
  /** When true, the sync icon animates (e.g. catalog sync in progress). */
  syncInProgress?: boolean;
  /** Per-source progress entries surfaced from syncPollingService. */
  syncProgress?: SyncProgressEntry[];
  /** Per-source last sync timestamps shown when idle. */
  lastSyncTimes?: Array<{ label: string; time: string | null }>;
  /** Extra action buttons rendered alongside the sync button. */
  actions?: ReactNode;
  /** Content rendered below the description (e.g. a "Learn more" link). */
  descriptionExtra?: ReactNode;
}

/** Catalog synchronization behavior for the existing scaffolder pages. */
export const CatalogSyncHeader = (props: CatalogSyncHeaderProps) => {
  const { isSuperuser, loading } = useIsSuperuser();
  const classes = usePageHeaderStyles();
  const entries = props.syncProgress ?? [];
  const recorded = (props.lastSyncTimes ?? []).filter(source => source.time);
  let hint: string | ReactElement = '';
  let detailed = false;
  if (loading) {
    hint = 'Checking permissions...';
  } else if (props.syncDisabled && props.syncDisabledReason) {
    hint = props.syncDisabledReason;
  } else if (
    entries.length > 0 &&
    (props.syncInProgress || entries.some(entry => entry.outcome !== 'success'))
  ) {
    hint = <SyncProgressPopover entries={entries} />;
    detailed = true;
  } else if (!props.syncInProgress && recorded.length > 0) {
    hint = <LastSyncedTooltip sources={recorded} />;
    detailed = true;
  }
  return (
    <PageHeader
      title={props.title}
      tooltip={props.tooltip}
      description={
        <>
          {props.description}
          {props.descriptionExtra && <> {props.descriptionExtra}</>}
        </>
      }
      actions={
        <>
          {props.actions}
          {(loading || isSuperuser) && (
            <CatalogSyncButton
              className={classes.syncButton}
              disabled={loading || Boolean(props.syncDisabled)}
              running={Boolean(props.syncInProgress)}
              onSync={props.onSyncClick}
              tooltip={hint}
              detailed={detailed}
              placement="bottom-end"
            />
          )}
        </>
      }
    />
  );
};
