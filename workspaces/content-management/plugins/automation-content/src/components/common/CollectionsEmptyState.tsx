import type { ReactElement, ReactNode } from 'react';
import { Link } from '@material-ui/core';
import SearchIcon from '@material-ui/icons/Search';
import SettingsIcon from '@material-ui/icons/Settings';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import {
  EmptyStateView,
  SyncProgressPopover,
  useIsSuperuser,
  useSharedStyles,
} from '@ansible/portal-plugin-sdk';
import type { SyncProgressEntry } from '@ansible/portal-plugin-sdk';
import { CONFIGURATION_DOCS_URL } from './constants';
import { CatalogSyncButton } from './CatalogSyncButton';

export interface CollectionsEmptyStateProps {
  onSyncClick?: () => void;
  hasConfiguredSources?: boolean | null;
  repositoryFilter?: boolean;
  syncDisabled?: boolean;
  /** Blocking explanation, or a busy fallback when detailed progress is unavailable. */
  syncDisabledReason?: string;
  syncInProgress?: boolean;
  syncProgress?: SyncProgressEntry[];
  configDocsUrl?: string;
}

function collectionGuidance(
  props: CollectionsEmptyStateProps,
  administrator: boolean,
) {
  if (props.repositoryFilter) {
    return {
      title: 'No collections discovered from this repository',
      description:
        'Collections from this repository will appear here after the catalog sync discovers them.',
    };
  }
  if (props.hasConfiguredSources === false) {
    return {
      title: 'No content sources configured',
      description: administrator
        ? 'No content sources are defined in the application configuration. To view collections, configure a provider in the app-config.yaml file.'
        : 'Content sources are not currently configured for this environment. Contact your organization administrator to add content providers.',
    };
  }
  return {
    title: 'No Collections Found',
    description: administrator
      ? 'No collections were retrieved from the configured sources. Sync the catalog to fetch the latest contents.'
      : 'No collections are available in the catalog. Contact your organization administrator to sync the content sources.',
  };
}

function CollectionSyncAction(
  props: CollectionsEmptyStateProps & { onSyncClick: () => void },
) {
  const classes = useSharedStyles();
  const progress = props.syncProgress ?? [];
  let tooltip: string | ReactElement = '';
  let detailed = false;
  if (props.syncDisabled && props.syncDisabledReason) {
    tooltip = props.syncDisabledReason;
  } else if (
    progress.length > 0 &&
    (props.syncInProgress ||
      progress.some(
        entry => entry.outcome === 'failure' || entry.outcome === 'ambiguous',
      ))
  ) {
    tooltip = <SyncProgressPopover entries={progress} />;
    detailed = true;
  }
  return (
    <CatalogSyncButton
      className={classes.syncButton}
      disabled={Boolean(props.syncDisabled)}
      running={Boolean(props.syncInProgress)}
      onSync={props.onSyncClick}
      tooltip={tooltip}
      detailed={detailed}
    />
  );
}

/** Collection-specific guidance and sync controls for scaffolder catalog consumers. */
export const CollectionsEmptyState = (props: CollectionsEmptyStateProps) => {
  const { isSuperuser } = useIsSuperuser();
  const classes = useSharedStyles();
  const guidance = collectionGuidance(props, isSuperuser);
  const needsConfiguration = props.hasConfiguredSources === false;
  const Icon =
    !props.repositoryFilter && needsConfiguration ? SettingsIcon : SearchIcon;
  let actions: ReactNode;
  if (!props.repositoryFilter && isSuperuser) {
    if (needsConfiguration) {
      actions = (
        <Link
          href={props.configDocsUrl ?? CONFIGURATION_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={classes.emptyStateDocsLink}
        >
          View Documentation
          <OpenInNewIcon className={classes.emptyStateDocsIcon} />
        </Link>
      );
    } else if (props.onSyncClick) {
      actions = (
        <CollectionSyncAction {...props} onSyncClick={props.onSyncClick} />
      );
    }
  }
  return (
    <EmptyStateView
      {...guidance}
      icon={<Icon fontSize="inherit" />}
      actions={actions}
    />
  );
};
