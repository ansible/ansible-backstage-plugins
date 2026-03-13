import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Link,
  Tooltip,
  Typography,
} from '@material-ui/core';
import StarBorder from '@material-ui/icons/StarBorder';
import Star from '@material-ui/icons/Star';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';

import { CollectionCardProps } from './types';
import { useCollectionsStyles } from './styles';
import { buildSourceString, formatTimeAgo, getSourceUrl } from './utils';
import { RepositoryBadge } from './RepositoryBadge';

export const CollectionCard = ({
  entity,
  onClick,
  isStarred,
  onToggleStar,
  syncStatusMap,
}: CollectionCardProps) => {
  const classes = useCollectionsStyles();

  const spec = entity.spec || {};
  const collectionNamespace =
    typeof spec.collection_namespace === 'string'
      ? spec.collection_namespace
      : '';
  const collectionName =
    typeof spec.collection_name === 'string' ? spec.collection_name : '';
  const fullName =
    typeof spec.collection_full_name === 'string' && spec.collection_full_name
      ? spec.collection_full_name
      : `${collectionNamespace}.${collectionName}`;
  const version =
    typeof spec.collection_version === 'string'
      ? spec.collection_version
      : 'N/A';
  const sourceString = buildSourceString(entity);
  const sourceUrl = getSourceUrl(entity);
  const entityName = entity.metadata.name;
  const linkPath = `/self-service/collections/${entityName}`;

  const sourceId =
    entity.metadata?.annotations?.['ansible.io/discovery-source-id'];
  const syncStatus = sourceId ? syncStatusMap[sourceId] : null;

  let lastSync: string;
  if (syncStatus?.lastSyncTime) {
    lastSync = formatTimeAgo(syncStatus.lastSyncTime);
  } else if (!syncStatus?.lastSyncTime && !syncStatus?.lastFailedSyncTime) {
    lastSync = 'Never Synced';
  } else {
    lastSync = 'Not Available';
  }

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleStar(entity);
  };

  return (
    <Card className={classes.collectionCard} onClick={() => onClick(linkPath)}>
      <CardContent className={classes.cardContent}>
        <Box className={classes.cardTitleRow}>
          <Box className={classes.titleWithBadge} title={fullName}>
            <Typography className={classes.cardTitleText}>
              {fullName}
            </Typography>
            <RepositoryBadge entity={entity} />
          </Box>
          <Tooltip
            title={isStarred ? 'Remove from favorites' : 'Add to favorites'}
          >
            <IconButton
              className={classes.starButton}
              onClick={handleStarClick}
              aria-label={
                isStarred ? 'Remove from favorites' : 'Add to favorites'
              }
            >
              {isStarred ? (
                <Star className={classes.starIcon} />
              ) : (
                <StarBorder className={classes.starIconEmpty} />
              )}
            </IconButton>
          </Tooltip>
        </Box>

        <Box className={classes.cardVersion}>
          <Chip
            label={version === 'N/A' ? 'N/A' : `v${version}`}
            size="small"
            className={classes.versionChip}
          />
        </Box>

        <Box className={classes.cardSource}>
          <Typography variant="body2" component="div">
            <span className={classes.sourceLabel}>Source: </span>
            {sourceUrl ? (
              <Link
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={classes.sourceLink}
                onClick={e => e.stopPropagation()}
              >
                <span className={classes.sourceLinkText}>{sourceString}</span>
                <OpenInNewIcon className={classes.sourceLinkIcon} />
              </Link>
            ) : (
              <span className={classes.sourceText}>{sourceString}</span>
            )}
          </Typography>
        </Box>

        <Typography className={classes.lastSync}>
          Last Sync: {lastSync}
        </Typography>
      </CardContent>
    </Card>
  );
};
