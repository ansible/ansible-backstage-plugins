import { Box, Button, Link, Tooltip, Typography } from '@material-ui/core';
import SearchIcon from '@material-ui/icons/Search';
import SyncIcon from '@material-ui/icons/Sync';
import SettingsIcon from '@material-ui/icons/Settings';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import { useSharedStyles, useProgressTooltipStyles } from './styles';
import { CONFIGURATION_DOCS_URL } from './constants';
import { EmptyStateProps } from './types';
import { useIsSuperuser } from '../../hooks';
import { SyncProgressPopover } from './SyncProgressPopover';

export const EmptyState = ({
  onSyncClick,
  hasConfiguredSources,
  repositoryFilter,
  syncDisabled = false,
  syncDisabledReason,
  syncInProgress = false,
  syncProgress = [],
}: EmptyStateProps) => {
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
      <Box className={classes.emptyState}>
        <SearchIcon className={classes.emptyStateIcon} />
        <Typography variant="h5" className={classes.emptyStateTitle}>
          No collections discovered from this repository
        </Typography>
        <Typography variant="body1" className={classes.emptyStateDescription}>
          Collections from this repository will appear here after the catalog
          sync discovers them.
        </Typography>
      </Box>
    );
  }

  if (hasConfiguredSources === false) {
    return (
      <Box className={classes.emptyState}>
        <SettingsIcon className={classes.emptyStateIcon} />
        <Typography variant="h5" className={classes.emptyStateTitle}>
          No content sources configured
        </Typography>
        <Typography variant="body1" className={classes.emptyStateDescription}>
          {allowed
            ? 'No content sources are defined in the application configuration. To view collections, configure a provider in the app-config.yaml file.'
            : 'Content sources are not currently configured for this environment. Contact your organization administrator to add content providers.'}
        </Typography>
        {allowed && (
          <Link
            href={CONFIGURATION_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={classes.emptyStateDocsLink}
          >
            View Documentation
            <OpenInNewIcon className={classes.emptyStateDocsIcon} />
          </Link>
        )}
      </Box>
    );
  }

  return (
    <Box className={classes.emptyState}>
      <SearchIcon className={classes.emptyStateIcon} />
      <Typography variant="h5" className={classes.emptyStateTitle}>
        No Collections Found
      </Typography>
      <Typography variant="body1" className={classes.emptyStateDescription}>
        {allowed
          ? 'No collections were retrieved from the configured sources. Sync the catalog to fetch the latest contents.'
          : 'No collections are available in the catalog. Contact your organization administrator to sync the content sources.'}
      </Typography>
      {allowed && onSyncClick && (
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
      )}
    </Box>
  );
};
