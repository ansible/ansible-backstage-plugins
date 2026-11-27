import {
  Box,
  Card,
  CardContent,
  Typography,
  Link,
  Button,
} from '@material-ui/core';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import { Entity } from '@backstage/catalog-model';

import { useCollectionsStyles } from '../CollectionsCatalog/styles';
import { getSourceUrl, buildSourceString } from '../CollectionsCatalog/utils';

export interface RepositoryAboutCardProps {
  entity: Entity;
  onViewSource?: () => void;
  onNavigateToCollections?: () => void;
}

export const RepositoryAboutCard = ({
  entity,
  onViewSource,
  onNavigateToCollections,
}: RepositoryAboutCardProps) => {
  const classes = useCollectionsStyles();

  const description =
    entity.metadata?.description ||
    'Git repository discovered from Ansible content sources.';

  const spec = (entity.spec || {}) as {
    repository_name?: string;
    repository_default_branch?: string;
    repository_collection_count?: number;
    repository_ee_count?: number;
    repository_collections?: string[];
  };

  const defaultBranch = spec.repository_default_branch || '—';
  const collectionCount = spec.repository_collection_count ?? 0;
  const eeCount = spec.repository_ee_count ?? 0;

  const sourceUrl = getSourceUrl(entity);
  const sourceString = buildSourceString(entity);

  const tags: string[] = Array.isArray(entity.metadata?.tags)
    ? entity.metadata.tags
    : [];

  const collectionsLabel = `${collectionCount} collection${collectionCount === 1 ? '' : 's'}`;
  const containsCollectionsPart =
    collectionCount > 0
      ? (() => {
          if (onNavigateToCollections) {
            return (
              <Link
                component="button"
                type="button"
                variant="body1"
                className={classes.aboutSourceLink}
                onClick={onNavigateToCollections}
                style={{ cursor: 'pointer' }}
              >
                {collectionsLabel}
              </Link>
            );
          }
          return <span>{collectionsLabel}</span>;
        })()
      : null;

  return (
    <Card className={classes.aboutCard} variant="outlined">
      <CardContent className={classes.aboutCardContent}>
        <Box className={classes.aboutCardHeader}>
          <Typography className={classes.aboutCardTitle}>About</Typography>
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
          <Typography className={classes.aboutCardLabel}>Source</Typography>
          {sourceUrl ? (
            <Link
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={classes.aboutSourceLink}
              onClick={e => {
                e.preventDefault();
                onViewSource?.();
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
          <Typography className={classes.aboutCardLabel}>
            Default branch
          </Typography>
          <Typography className={classes.aboutCardValue}>
            {defaultBranch}
          </Typography>
        </Box>

        <Box className={classes.aboutCardSection}>
          <Typography className={classes.aboutCardLabel}>Contains</Typography>
          <Typography className={classes.aboutCardValue} component="span">
            {collectionCount > 0 || eeCount > 0 ? (
              <>
                {containsCollectionsPart}
                {collectionCount > 0 && eeCount > 0 && ', '}
                {eeCount > 0 &&
                  `${eeCount} EE definition${eeCount === 1 ? '' : 's'}`}
              </>
            ) : (
              '—'
            )}
          </Typography>
        </Box>

        {tags.length > 0 && (
          <Box className={classes.aboutCardSection}>
            <Typography className={classes.aboutCardLabel}>Tags</Typography>
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
          </Box>
        )}
      </CardContent>
    </Card>
  );
};
