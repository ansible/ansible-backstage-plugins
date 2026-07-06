/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  CircularProgress,
  Tooltip,
  Typography,
  makeStyles,
  useTheme,
} from '@material-ui/core';
import ExtensionIcon from '@material-ui/icons/Extension';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import type { GitRepositoryDetailTabContext } from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import { useApmeProjectContext } from '../../hooks/useApmeProjectContext';
import { ApmeUnavailable } from '../ApmeUnavailable';
import {
  APME_GATEWAY_UNAVAILABLE_MESSAGE,
  isApmeConnectionError,
} from '../../utils/apmeConnectionError';
import { collectionViolationCount } from '../../utils/violationAnalytics';

const SOURCE_COLORS: Record<string, { bg: string; color: string }> = {
  specified: { bg: '#e7f1fa', color: '#0066cc' },
  dependency: { bg: '#f4f0e6', color: '#795600' },
  learned: { bg: '#e9f5e9', color: '#3e8635' },
  galaxy: { bg: '#e7f1fa', color: '#0066cc' },
};

const useStyles = makeStyles(theme => ({
  root: {
    padding: '24px 0',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: 16,
    marginTop: 16,
  },
  card: {
    borderRadius: 8,
    padding: 16,
    border: `1px solid ${theme.palette.divider}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  fqcn: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: 600,
  },
  sourceBadge: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    padding: '1px 6px',
    borderRadius: 3,
  },
  noData: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    color: theme.palette.text.secondary,
    gap: 8,
  },
  galaxyLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    color: theme.palette.primary.main,
    textDecoration: 'none',
  },
}));

function galaxyUrl(fqcn: string): string {
  const [namespace, name] = fqcn.split('.');
  return `https://galaxy.ansible.com/ui/repo/published/${namespace}/${name}/`;
}

export interface ApmeRepositoryCollectionsTabProps {
  context: GitRepositoryDetailTabContext;
}

export const ApmeRepositoryCollectionsTab = ({
  context,
}: ApmeRepositoryCollectionsTabProps) => {
  const classes = useStyles();
  const theme = useTheme();
  const [, setSearchParams] = useSearchParams();
  const ctx = useApmeProjectContext(context.entity);

  const navigateToDependencies = () => {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'dependencies');
    setSearchParams(params, { replace: true });
  };

  const collections = useMemo(() => {
    const rows = [...(ctx.dependencies?.collections ?? [])];
    const sourceOrder: Record<string, number> = {
      specified: 0,
      learned: 1,
      dependency: 2,
      galaxy: 0,
    };
    return rows.sort(
      (a, b) =>
        (sourceOrder[a.source] ?? 9) - (sourceOrder[b.source] ?? 9) ||
        collectionViolationCount(ctx.violations, b) -
          collectionViolationCount(ctx.violations, a),
    );
  }, [ctx.dependencies, ctx.violations]);

  if (ctx.loading || ctx.dependenciesLoading) {
    return (
      <Box className={classes.noData}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (ctx.error && isApmeConnectionError(ctx.error.message)) {
    return <ApmeUnavailable message={APME_GATEWAY_UNAVAILABLE_MESSAGE} />;
  }

  if (!ctx.dependencies || collections.length === 0) {
    return (
      <Box className={classes.noData}>
        <ExtensionIcon style={{ fontSize: 40, opacity: 0.3 }} />
        <Typography style={{ fontSize: 16, fontWeight: 500 }}>
          No collections detected
        </Typography>
        <Typography style={{ fontSize: 13 }}>
          Run a quality scan to detect collections used in this repository.
        </Typography>
      </Box>
    );
  }

  const withViolations = collections.filter(
    c => collectionViolationCount(ctx.violations, c) > 0,
  );
  const specified = collections.filter(c => c.source === 'specified');

  return (
    <Box className={classes.root}>
      <Box
        display="flex"
        alignItems="center"
        style={{ gap: 10, marginBottom: 4 }}
      >
        <Typography style={{ fontSize: 13 }}>
          <strong>{collections.length}</strong> collection
          {collections.length !== 1 ? 's' : ''} detected
          {specified.length > 0 && specified.length < collections.length && (
            <span style={{ color: theme.palette.text.secondary }}>
              {' '}
              · {specified.length} specified,{' '}
              {collections.length - specified.length} from dependencies
            </span>
          )}
        </Typography>
        {withViolations.length > 0 && (
          <>
            <span style={{ color: theme.palette.divider }}>|</span>
            <span
              role="button"
              tabIndex={0}
              onClick={navigateToDependencies}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigateToDependencies();
                }
              }}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#c9190b',
                cursor: 'pointer',
              }}
            >
              {withViolations.length} with violations →
            </span>
          </>
        )}
        <Tooltip title="Collections are discovered from the latest gateway scan session.">
          <HelpOutlineIcon style={{ fontSize: 14, opacity: 0.5 }} />
        </Tooltip>
      </Box>

      <Box className={classes.grid}>
        {collections.map(c => {
          const srcStyle = SOURCE_COLORS[c.source] ?? SOURCE_COLORS.specified;
          const vCount = collectionViolationCount(ctx.violations, c);
          const [ns, name] = c.fqcn.split('.');
          return (
            <Box key={c.fqcn} className={classes.card}>
              <Typography className={classes.fqcn}>{c.fqcn}</Typography>
              <Box
                display="flex"
                alignItems="center"
                style={{ gap: 8, flexWrap: 'wrap' }}
              >
                <Typography variant="caption" color="textSecondary">
                  v{c.version}
                </Typography>
                <span
                  className={classes.sourceBadge}
                  style={{
                    backgroundColor: srcStyle.bg,
                    color: srcStyle.color,
                  }}
                >
                  {c.source}
                </span>
                {vCount > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#c9190b',
                    }}
                  >
                    {vCount} violation{vCount !== 1 ? 's' : ''}
                  </span>
                )}
              </Box>
              {ns && name && (
                <a
                  href={galaxyUrl(c.fqcn)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={classes.galaxyLink}
                >
                  View on Galaxy <OpenInNewIcon style={{ fontSize: 12 }} />
                </a>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
