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
import { makeStyles, useTheme } from '@material-ui/core/styles';
import AutorenewIcon from '@material-ui/icons/Autorenew';
import EditIcon from '@material-ui/icons/Edit';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import React, { useState } from 'react';
import { Entity } from '@backstage/catalog-model';
import { getEntityEEDefinitionUrl } from './helpers';

const useStyles = makeStyles(theme => ({
  tagButton: {
    borderRadius: 8,
    borderColor: '#D3D3D3',
    textTransform: 'none',
  },
  descriptionTruncate: {
    display: '-webkit-box',
    WebkitLineClamp: 4,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  rotate: {
    animation: '$spin 1s linear infinite',
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
  aboutCard: {
    borderRadius: 12,
    border: `1px solid ${theme.palette.divider}`,
  },
  aboutCardContent: {
    padding: theme.spacing(2.5),
  },
  aboutCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  aboutCardTitle: {
    fontWeight: 600,
    fontSize: '1.25rem',
  },
  aboutCardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
  },
  aboutCardLabel: {
    color: theme.palette.text.secondary,
    fontWeight: 600,
    fontSize: '0.75rem',
    textTransform: 'uppercase' as const,
    marginBottom: theme.spacing(0.5),
  },
  aboutCardValue: {
    fontSize: '0.875rem',
    wordBreak: 'break-word' as const,
  },
  aboutCardSection: {
    marginTop: theme.spacing(2),
  },
  aboutSourceIcon: {
    fontSize: '0.875rem',
    flexShrink: 0,
  },
  aboutCardDivider: {
    margin: theme.spacing(2, -2.5),
  },
  aboutCardTag: {
    borderRadius: 6,
    borderColor: theme.palette.divider,
    textTransform: 'none' as const,
    fontSize: '0.75rem',
    padding: theme.spacing(0.25, 1),
  },
  aboutSourceLink: {
    color: theme.palette.primary.main,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    '&:hover': {
      textDecoration: 'underline',
    },
  },
}));

interface AboutCardProps {
  entity: Entity;
  ownerName: string | null;
  baseImageName: string | null;
  sourceLocationUrl: string | null;
  isRefreshing: boolean;
  isDownloadExperience: boolean;
  onRefresh: () => void;
}

export const AboutCard: React.FC<AboutCardProps> = ({
  entity,
  ownerName,
  baseImageName,
  sourceLocationUrl,
  isRefreshing,
  isDownloadExperience,
  onRefresh,
}) => {
  const classes = useStyles();
  const theme = useTheme();
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const scmProvider =
    entity?.metadata?.annotations?.['ansible.io/scm-provider']
      ?.toString()
      .toLowerCase() ?? '';
  let sourceLabel = 'Source';
  if (scmProvider.includes('github')) sourceLabel = 'GitHub';
  else if (scmProvider.includes('gitlab')) sourceLabel = 'GitLab';
  const description =
    entity?.metadata?.description ??
    entity?.metadata?.title ??
    'No description available.';
  const showReadMore = description.length > 150;

  return (
    <Card className={classes.aboutCard} variant="outlined">
      <CardContent className={classes.aboutCardContent}>
        <Box className={classes.aboutCardHeader}>
          <Typography className={classes.aboutCardTitle}>About</Typography>
          {!isDownloadExperience && (
            <Box className={classes.aboutCardActions}>
              <Tooltip title="Refresh">
                <IconButton
                  size="small"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  aria-label="Refresh"
                >
                  <AutorenewIcon
                    className={isRefreshing ? classes.rotate : ''}
                    style={{ color: '#757575' }}
                  />
                </IconButton>
              </Tooltip>
              {getEntityEEDefinitionUrl(entity) && (
                <IconButton
                  size="small"
                  component="a"
                  href={getEntityEEDefinitionUrl(entity)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Edit definition"
                >
                  <EditIcon style={{ color: theme.palette.primary.main }} />
                </IconButton>
              )}
            </Box>
          )}
        </Box>

        {/* Description - inline expand when > 150 chars, no TechDocs link */}
        <Box>
          <Typography className={classes.aboutCardLabel}>
            Description
          </Typography>
          <Typography className={classes.aboutCardValue}>
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
        <Box className={classes.aboutCardSection}>
          <Typography className={classes.aboutCardLabel}>Owner</Typography>
          <Typography className={classes.aboutCardValue}>
            {ownerName}
          </Typography>
        </Box>

        {/* Base image */}
        <Box className={classes.aboutCardSection}>
          <Typography className={classes.aboutCardLabel}>Base image</Typography>
          <Typography className={classes.aboutCardValue}>
            {baseImageName ?? '—'}
          </Typography>
        </Box>

        {/* Source - hidden when download-experience is true; label by SCM, View in source + readme.md like Resources card */}
        {!isDownloadExperience && (
          <Box className={classes.aboutCardSection}>
            <Typography className={classes.aboutCardLabel}>Source</Typography>
            {sourceLocationUrl ? (
              <Box className={classes.sourceLinkRow}>
                <Link
                  href={sourceLocationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={classes.aboutSourceLink}
                >
                  <span>{sourceLabel}</span>
                  <OpenInNewIcon className={classes.aboutSourceIcon} />
                </Link>
              </Box>
            ) : (
              <Typography variant="body2" color="textSecondary">
                —
              </Typography>
            )}
          </Box>
        )}

        <Divider className={classes.aboutCardDivider} />

        {/* Tags */}
        <Box marginTop={2}>
          <Typography className={classes.aboutCardLabel}>Tags</Typography>
          <Box display="flex" gridGap={8} marginTop={1} flexWrap="wrap">
            {Array.isArray(entity?.metadata?.tags) &&
            entity.metadata?.tags?.length > 0 ? (
              entity.metadata?.tags?.map((t: string) => (
                <Button
                  key={t}
                  variant="outlined"
                  size="small"
                  className={classes.aboutCardTag}
                  disabled
                >
                  {t}
                </Button>
              ))
            ) : (
              <Typography
                className={classes.aboutCardValue}
                color="textSecondary"
              >
                No tags
              </Typography>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};
