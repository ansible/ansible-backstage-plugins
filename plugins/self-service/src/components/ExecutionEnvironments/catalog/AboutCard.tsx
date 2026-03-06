import {
  Box,
  Card,
  CardContent,
  Typography,
  Divider,
  IconButton,
  Button,
  Link,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import AutorenewIcon from '@material-ui/icons/Autorenew';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import React, { useState } from 'react';
import { Entity } from '@backstage/catalog-model';

const useStyles = makeStyles(() => ({
  tagButton: {
    borderRadius: 8,
    borderColor: '#D3D3D3',
    textTransform: 'none',
  },
  rotate: {
    animation: '$spin 1s linear',
  },
  '@keyframes spin': {
    '0%': { transform: 'rotate(0deg)' },
    '100%': { transform: 'rotate(360deg)' },
  },
  descriptionExpand: {
    color: 'primary',
    cursor: 'pointer',
    fontWeight: 600,
  },
  sourceLinkRow: {
    display: 'flex',
    alignItems: 'center',
    gridGap: 8,
    marginBottom: 8,
    '&:last-child': { marginBottom: 0 },
  },
  sourceLink: {
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gridGap: 8,
  },
}));

interface AboutCardProps {
  entity: Entity;
  ownerName: string | null;
  baseImageName: string | null;
  sourceLocationUrl: string | null;
  onOpenSourceLocation: () => void;
  isRefreshing: boolean;
  isDownloadExperience: boolean;
  onRefresh: () => void;
}

export const AboutCard: React.FC<AboutCardProps> = ({
  entity,
  ownerName,
  baseImageName,
  sourceLocationUrl,
  onOpenSourceLocation,
  isRefreshing,
  isDownloadExperience,
  onRefresh,
}) => {
  const classes = useStyles();
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const scmProvider =
    entity?.metadata?.annotations?.['ansible.io/scm-provider']
      ?.toString()
      .toLowerCase() ?? '';
  let sourceLabel = 'Source';
  if (scmProvider.includes('github')) sourceLabel = 'GitHub Source Link';
  else if (scmProvider.includes('gitlab')) sourceLabel = 'GitLab Source Link';
  const description =
    entity?.metadata?.description ??
    entity?.metadata?.title ??
    'No description available.';
  const showReadMore = description.length > 150;

  return (
    <Card
      variant="outlined"
      style={{ borderRadius: 16, borderColor: '#D3D3D3' }}
    >
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography
            variant="h6"
            style={{
              fontWeight: 'bold',
              fontSize: '1.5rem',
              marginLeft: 10,
            }}
          >
            About
          </Typography>
          {!isDownloadExperience && (
            <Box display="flex" alignItems="center">
              <IconButton size="small" onClick={onRefresh}>
                <AutorenewIcon
                  className={isRefreshing ? classes.rotate : ''}
                  style={{ color: '#757575' }}
                />
              </IconButton>
            </Box>
          )}
        </Box>
        <Divider style={{ margin: '12px -16px 12px' }} />

        {/* Description - inline expand when > 150 chars, no TechDocs link */}
        <Box>
          <Typography
            variant="caption"
            style={{ color: 'gray', fontWeight: 600 }}
          >
            Description
          </Typography>
          <Typography variant="body2">
            {showReadMore && !descriptionExpanded
              ? `${description.slice(0, 150)}...`
              : description}
          </Typography>
          {showReadMore && (
            <>
              {descriptionExpanded ? (
                <Link
                  component="button"
                  variant="body2"
                  className={classes.descriptionExpand}
                  onClick={() => setDescriptionExpanded(false)}
                >
                  Read less
                </Link>
              ) : (
                <Link
                  component="button"
                  variant="body2"
                  className={classes.descriptionExpand}
                  onClick={() => setDescriptionExpanded(true)}
                >
                  Read more
                </Link>
              )}
            </>
          )}
        </Box>

        {/* Owner */}
        <Box marginTop={2}>
          <Typography
            variant="caption"
            style={{ color: 'gray', fontWeight: 600 }}
          >
            Owner
          </Typography>
          <Typography variant="body2">{ownerName}</Typography>
        </Box>

        {/* Base image */}
        <Box marginTop={2}>
          <Typography
            variant="caption"
            style={{ color: 'gray', fontWeight: 600 }}
          >
            Base image
          </Typography>
          <Typography variant="body2">{baseImageName ?? '—'}</Typography>
        </Box>

        {/* Source - hidden when download-experience is true; label by SCM, View in source + readme.md like Resources card */}
        {!isDownloadExperience && (
          <Box marginTop={2}>
            <Typography
              variant="caption"
              style={{ color: 'gray', fontWeight: 600 }}
            >
              {sourceLabel}
            </Typography>
            <Box marginTop={0.5}>
              {sourceLocationUrl ? (
                <Box className={classes.sourceLinkRow}>
                  <OpenInNewIcon fontSize="small" color="primary" />
                  <Link
                    component="button"
                    variant="body2"
                    color="primary"
                    onClick={onOpenSourceLocation}
                    className={classes.sourceLink}
                  >
                    source link
                  </Link>
                </Box>
              ) : (
                <Typography variant="body2" color="textSecondary">
                  —
                </Typography>
              )}
            </Box>
          </Box>
        )}

        {/* Tags */}
        <Box marginTop={2}>
          <Typography
            variant="caption"
            style={{ color: 'gray', fontWeight: 600 }}
          >
            Tags
          </Typography>
          <Box display="flex" gridGap={8} marginTop={1} flexWrap="wrap">
            {Array.isArray(entity?.metadata?.tags) &&
            entity.metadata?.tags?.length > 0 ? (
              entity.metadata?.tags?.map((t: string) => (
                <Button
                  variant="outlined"
                  size="small"
                  key={t}
                  className={classes.tagButton}
                  style={{
                    textTransform: 'none',
                    borderRadius: 8,
                    borderColor: '#D3D3D3',
                  }}
                >
                  {t}
                </Button>
              ))
            ) : (
              <Typography variant="body2" color="textSecondary">
                No tags
              </Typography>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};
