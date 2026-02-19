import {
  Box,
  Card,
  CardContent,
  Typography,
  Divider,
  IconButton,
  Button,
  Link,
  Tooltip,
} from '@material-ui/core';
import AutorenewIcon from '@material-ui/icons/Autorenew';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';

import { CollectionAboutCardProps } from './types';
import { useCollectionsStyles } from './styles';
import { formatTimeAgo, getSourceUrl, buildSourceString } from './utils';

export const CollectionAboutCard = ({
  entity,
  lastSync,
  onViewSource,
  onRefresh,
  isRefreshing,
}: CollectionAboutCardProps) => {
  const classes = useCollectionsStyles();

  const spec = entity.spec || {};
  const description =
    entity.metadata.description || 'No description available.';
  const version =
    typeof spec.collection_version === 'string'
      ? spec.collection_version
      : 'N/A';

  const rawAuthors = spec.collection_authors;
  const authors: string[] = Array.isArray(rawAuthors)
    ? rawAuthors.filter((a): a is string => typeof a === 'string')
    : [];

  const license =
    typeof spec.collection_license === 'string' ? spec.collection_license : '';

  const sourceUrl = getSourceUrl(entity);
  const sourceString = buildSourceString(entity);

  const tags: string[] = Array.isArray(entity.metadata.tags)
    ? entity.metadata.tags.filter(
        (t: string) =>
          t !== 'ansible-collection' && !['github', 'gitlab'].includes(t),
      )
    : [];

  const lastSyncFormatted = lastSync
    ? formatTimeAgo(new Date(lastSync))
    : 'Unknown';

  return (
    <Card className={classes.aboutCard} variant="outlined">
      <CardContent className={classes.aboutCardContent}>
        <Box className={classes.aboutCardHeader}>
          <Typography className={classes.aboutCardTitle}>About</Typography>
          {onRefresh && (
            <Box className={classes.aboutCardActions}>
              <Tooltip title="Refresh">
                <IconButton
                  size="small"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                >
                  <AutorenewIcon
                    className={isRefreshing ? classes.refreshing : ''}
                    style={{ fontSize: '1.25rem' }}
                  />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>

        <Box>
          <Typography className={classes.aboutCardLabel}>
            Description
          </Typography>
          <Typography className={classes.aboutCardValue}>
            {description}
          </Typography>
        </Box>

        <Box className={classes.aboutCardSection}>
          <Typography className={classes.aboutCardLabel}>
            {authors.length === 1 ? 'Author' : 'Authors'}
          </Typography>
          <Typography className={classes.aboutCardValue}>
            {authors.length > 0 ? authors.join(', ') : 'Unknown'}
          </Typography>
        </Box>

        <Box className={classes.aboutCardSection}>
          <Typography className={classes.aboutCardLabel}>Source</Typography>
          {sourceUrl ? (
            <Link
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={classes.aboutSourceLink}
              onClick={e => {
                e.preventDefault();
                onViewSource();
              }}
            >
              <span>{sourceString}</span>
              <OpenInNewIcon className={classes.aboutSourceIcon} />
            </Link>
          ) : (
            <Typography className={classes.aboutCardValue}>
              {sourceString || 'Unknown'}
            </Typography>
          )}
        </Box>

        <Box className={classes.aboutCardSection}>
          <Typography className={classes.aboutCardLabel}>Version</Typography>
          <Typography className={classes.aboutCardValue}>
            {version !== 'N/A' ? `v${version}` : 'N/A'}
          </Typography>
        </Box>

        {license && (
          <Box className={classes.aboutCardSection}>
            <Typography className={classes.aboutCardLabel}>License</Typography>
            <Typography className={classes.aboutCardValue}>
              {license}
            </Typography>
          </Box>
        )}

        <Box className={classes.aboutCardSection}>
          <Typography className={classes.aboutCardLabel}>Last Sync</Typography>
          <Typography className={classes.aboutCardValue}>
            {lastSyncFormatted}
          </Typography>
        </Box>

        <Divider className={classes.aboutCardDivider} />

        <Box>
          <Typography className={classes.aboutCardLabel}>Tags</Typography>
          {tags.length > 0 ? (
            <Box className={classes.aboutCardTagsContainer}>
              {tags.map((tag: string) => (
                <Button
                  key={tag}
                  variant="outlined"
                  size="small"
                  className={classes.aboutCardTag}
                  disabled
                >
                  {tag}
                </Button>
              ))}
            </Box>
          ) : (
            <Typography
              className={classes.aboutCardValue}
              color="textSecondary"
            >
              No tags
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};
