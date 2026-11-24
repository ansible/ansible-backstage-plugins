import { Button, Link, Tooltip } from '@material-ui/core';
import SearchIcon from '@material-ui/icons/Search';
import SyncIcon from '@material-ui/icons/Sync';
import SettingsIcon from '@material-ui/icons/Settings';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import { useSharedStyles, useProgressTooltipStyles } from '../../styles';
import { EmptyStateProps } from '../../types';
import { useIsSuperuser } from '../../hooks';
import { SyncProgressPopover } from '../SyncProgressPopover';
import { EmptyStateView } from '../EmptyStateView';

const DEFAULT_DOCS_URL = 'https://red.ht/self-service-config-docs';

/** @deprecated Use EmptyStateView and compose consumer-owned catalog behavior. */
export const EmptyState = ({
  onSyncClick,
  hasConfiguredSources,
  repositoryFilter,
  syncDisabled = false,
  syncDisabledReason,
  syncInProgress = false,
  syncProgress = [],
  configDocsUrl = DEFAULT_DOCS_URL,
}: EmptyStateProps & { configDocsUrl?: string }) => {
  const classes = useSharedStyles();
  const tooltipClasses = useProgressTooltipStyles();
  const { isSuperuser: allowed } = useIsSuperuser();

  const hasFailureOrAmbiguous = syncProgress.some(
    e => e.outcome === 'failure' || e.outcome === 'ambiguous',
  );
  const showProgressPopover =
    (syncInProgress || hasFailureOrAmbiguous) && syncProgress.length > 0;

  let tooltipTitle: JSX.Element | string = '';
  if (showProgressPopover) {
    tooltipTitle = <SyncProgressPopover entries={syncProgress} />;
  } else if (syncDisabled && syncDisabledReason) {
    tooltipTitle = syncDisabledReason;
  }

  if (repositoryFilter) {
    return (
      <EmptyStateView
        icon={<SearchIcon fontSize="inherit" />}
        title="No collections discovered from this repository"
        description="Collections from this repository will appear here after the catalog sync discovers them."
      />
    );
  }

  if (hasConfiguredSources === false) {
    return (
      <EmptyStateView
        icon={<SettingsIcon fontSize="inherit" />}
        title="No content sources configured"
        description={
          allowed
            ? 'No content sources are defined in the application configuration. To view collections, configure a provider in the app-config.yaml file.'
            : 'Content sources are not currently configured for this environment. Contact your organization administrator to add content providers.'
        }
        actions={
          allowed && (
            <Link
              href={configDocsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={classes.emptyStateDocsLink}
            >
              View Documentation
              <OpenInNewIcon className={classes.emptyStateDocsIcon} />
            </Link>
          )
        }
      />
    );
  }

  return (
    <EmptyStateView
      icon={<SearchIcon fontSize="inherit" />}
      title="No Collections Found"
      description={
        allowed
          ? 'No collections were retrieved from the configured sources. Sync the catalog to fetch the latest contents.'
          : 'No collections are available in the catalog. Contact your organization administrator to sync the content sources.'
      }
      actions={
        allowed &&
        onSyncClick && (
          <Tooltip
            title={tooltipTitle}
            classes={showProgressPopover ? tooltipClasses : undefined}
            interactive={showProgressPopover}
            arrow
            placement="bottom"
          >
            <span>
              <Button
                variant="outlined"
                color="primary"
                startIcon={
                  <SyncIcon
                    className={
                      syncInProgress ? classes.syncIconSpinning : undefined
                    }
                  />
                }
                onClick={onSyncClick}
                disabled={syncDisabled}
                className={classes.syncButton}
              >
                Sync Now
              </Button>
            </span>
          </Tooltip>
        )
      }
    />
  );
};
