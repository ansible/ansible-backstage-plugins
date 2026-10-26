import { Button, Link, Tooltip } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import SearchIcon from '@material-ui/icons/Search';
import SyncIcon from '@material-ui/icons/Sync';
import SettingsIcon from '@material-ui/icons/Settings';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import {
  EmptyStateView,
  SyncProgressPopover,
  useIsSuperuser,
  useSharedStyles,
  useProgressTooltipStyles,
} from '@ansible/portal-plugin-sdk';
import type { SyncProgressEntry } from '@ansible/portal-plugin-sdk';
import { CONFIGURATION_DOCS_URL } from './constants';

const useStyles = makeStyles(theme => ({
  syncWrapper: {
    display: 'inline-flex',
    '&:focus': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: 2,
      borderRadius: theme.shape.borderRadius,
    },
  },
}));

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

/** Collection-specific guidance and sync controls for scaffolder catalog consumers. */
export const CollectionsEmptyState = ({
  onSyncClick,
  hasConfiguredSources,
  repositoryFilter,
  syncDisabled = false,
  syncDisabledReason,
  syncInProgress = false,
  syncProgress = [],
  configDocsUrl = CONFIGURATION_DOCS_URL,
}: CollectionsEmptyStateProps) => {
  const classes = useSharedStyles();
  const localClasses = useStyles();
  const tooltipClasses = useProgressTooltipStyles();
  const { isSuperuser: allowed } = useIsSuperuser();

  const hasFailureOrAmbiguous = syncProgress.some(
    e => e.outcome === 'failure' || e.outcome === 'ambiguous',
  );
  const showProgressPopover =
    !(syncDisabled && syncDisabledReason) &&
    (syncInProgress || hasFailureOrAmbiguous) &&
    syncProgress.length > 0;

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
            <span
              className={localClasses.syncWrapper}
              role={syncDisabled ? 'button' : undefined}
              tabIndex={syncDisabled ? 0 : undefined}
              aria-label={
                syncDisabled ? 'Synchronization unavailable' : undefined
              }
              aria-disabled={syncDisabled || undefined}
            >
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
