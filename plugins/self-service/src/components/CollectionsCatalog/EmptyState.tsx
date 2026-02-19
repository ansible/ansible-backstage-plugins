import { Box, Button, Link, Typography } from '@material-ui/core';
import SearchIcon from '@material-ui/icons/Search';
import SyncIcon from '@material-ui/icons/Sync';
import SettingsIcon from '@material-ui/icons/Settings';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import { usePermission } from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';

import { useCollectionsStyles } from './styles';
import { CONFIGURATION_DOCS_URL } from './constants';

export interface EmptyStateProps {
  onSyncClick?: () => void;
  hasConfiguredSources?: boolean | null;
}

export const EmptyState = ({
  onSyncClick,
  hasConfiguredSources,
}: EmptyStateProps) => {
  const classes = useCollectionsStyles();
  const { allowed } = usePermission({
    permission: catalogEntityCreatePermission,
  });

  // No content sources configured
  if (hasConfiguredSources === false) {
    return (
      <Box className={classes.emptyState}>
        <SettingsIcon className={classes.emptyStateIcon} />
        <Typography variant="h5" className={classes.emptyStateTitle}>
          No content sources configured
        </Typography>
        <Typography variant="body1" className={classes.emptyStateDescription}>
          {allowed
            ? 'No content sources are not defined in the application configuration. To view collections, configure a provider in the app-config.yaml file.'
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

  // Sources configured but no collections found
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
        <Button
          variant="outlined"
          color="primary"
          startIcon={<SyncIcon />}
          onClick={onSyncClick}
          className={classes.syncButton}
        >
          Sync Now
        </Button>
      )}
    </Box>
  );
};
