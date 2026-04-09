import { Box, Link, Typography } from '@material-ui/core';
import LockOutlinedIcon from '@material-ui/icons/LockOutlined';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';

import { useSharedStyles } from './styles';
import { CONFIGURATION_DOCS_URL } from './constants';
import { useIsSuperuser } from '../../hooks';

type ScmIntegrationAuthErrorProps = {
  /** Shown in the subtitle, e.g. "execution environment", "collection", "repository" */
  resourceLabel: string;
};

/**
 * Full-width error when GitHub/GitLab content cannot be loaded because the
 * integration token from app-config is invalid or expired.
 */
export const ScmIntegrationAuthError = ({
  resourceLabel,
}: ScmIntegrationAuthErrorProps) => {
  const classes = useSharedStyles();
  const { isSuperuser: allowed } = useIsSuperuser();

  return (
    <Box className={classes.emptyStateContainer}>
      <Box className={classes.emptyState}>
        <LockOutlinedIcon
          className={classes.emptyStateIcon}
          color="error"
          style={{ fontSize: '4.5rem' }}
        />
        <Typography variant="h5" className={classes.emptyStateTitle}>
          SCM integration unavailable
        </Typography>
        <Typography variant="body1" className={classes.emptyStateDescription}>
          This {resourceLabel} could not be loaded from the source repository.
          The GitHub or GitLab token configured for this environment in{' '}
          <code>app-config</code> may be expired, revoked, or missing required
          scopes.
        </Typography>
        {allowed ? (
          <>
            <Typography
              variant="body2"
              className={classes.emptyStateDescription}
              style={{ marginBottom: 0 }}
            >
              Update the integration under <code>integrations.github</code> or{' '}
              <code>integrations.gitlab</code>, then restart or redeploy the
              backend so the new credentials take effect.
            </Typography>
            <Link
              href={CONFIGURATION_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={classes.emptyStateDocsLink}
            >
              View configuration documentation
              <OpenInNewIcon className={classes.emptyStateDocsIcon} />
            </Link>
          </>
        ) : (
          <Typography variant="body2" className={classes.emptyStateDescription}>
            Contact your administrator to refresh the GitHub or GitLab
            integration credentials for this portal.
          </Typography>
        )}
      </Box>
    </Box>
  );
};
