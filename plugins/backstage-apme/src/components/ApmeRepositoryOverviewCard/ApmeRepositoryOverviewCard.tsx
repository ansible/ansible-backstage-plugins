/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Tooltip,
  Typography,
  makeStyles,
  useTheme,
} from '@material-ui/core';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import RefreshIcon from '@material-ui/icons/Refresh';
import {
  SEVERITY_ORDER,
  type SeverityLevel,
} from '@ansible/backstage-apme-common/severity';
import { useApmeAiEnabled } from '../../hooks/useApmeEnabled';
import { useApmeProjectContext } from '../../hooks/useApmeProjectContext';
import { ApmeUnavailable } from '../ApmeUnavailable';
import {
  APME_GATEWAY_UNAVAILABLE_MESSAGE,
  isApmeConnectionError,
} from '../../utils/apmeConnectionError';
import type { GitRepositoryDetailTabContext } from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';

import {
  categoryBreakdown,
  categorySeverityBreakdown,
  fixableViolationCount,
  severityBreakdown,
  type ViolationCategory,
} from '../../utils/violationAnalytics';
import { useApmeColorTokens } from '../../hooks/useApmeColorTokens';

const CATEGORY_META: {
  key: ViolationCategory;
  label: string;
  tip: string;
}[] = [
  {
    key: 'modernize',
    label: 'Compatibility',
    tip: 'Deprecated syntax, removed modules, and version-specific issues that block AAP upgrades',
  },
  {
    key: 'secrets',
    label: 'Secrets',
    tip: 'Hardcoded credentials, tokens, and keys that should use vault or an external secrets manager',
  },
  {
    key: 'risk',
    label: 'Risk',
    tip: 'Security risks such as missing file permissions, unsafe shell usage, and privilege escalation',
  },
  {
    key: 'lint',
    label: 'Lint',
    tip: 'Code quality issues — naming conventions, FQCN usage, Jinja spacing, and changed_when',
  },
  {
    key: 'policy',
    label: 'Policy',
    tip: 'Organizational policy violations defined by OPA rules',
  },
  {
    key: 'dependencies',
    label: 'Dependencies',
    tip: 'Outdated or vulnerable collection and Python dependencies',
  },
];

const SEV_ORDER = SEVERITY_ORDER;

const useStyles = makeStyles(theme => ({
  card: {
    borderRadius: 8,
    marginBottom: theme.spacing(2),
  },
  categoryRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: 6,
    cursor: 'pointer',
  },
  track: {
    flex: 1,
    minWidth: 0,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(0,0,0,0.06)',
  },
}));

export interface ApmeRepositoryOverviewCardProps {
  context: GitRepositoryDetailTabContext;
}

export const ApmeRepositoryOverviewCard = ({
  context,
}: ApmeRepositoryOverviewCardProps) => {
  const classes = useStyles();
  const theme = useTheme();
  const colorTokens = useApmeColorTokens();
  const enableAi = useApmeAiEnabled();
  const [, setSearchParams] = useSearchParams();
  const ctx = useApmeProjectContext(context.entity);

  const navigateToQuality = (category?: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'quality');
    if (category) params.set('category', category);
    else params.delete('category');
    setSearchParams(params, { replace: true });
  };

  const totalViolations = ctx.violations.length;
  const sevCounts = useMemo(
    () => severityBreakdown(ctx.violations),
    [ctx.violations],
  );
  const catCounts = useMemo(
    () => categoryBreakdown(ctx.violations, ctx.rulesById),
    [ctx.violations, ctx.rulesById],
  );
  const fixable = useMemo(
    () => fixableViolationCount(ctx.violations, enableAi),
    [ctx.violations, enableAi],
  );

  if (ctx.loading || ctx.violationsLoading) {
    return (
      <Box display="flex" justifyContent="center" py={2}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (ctx.error && isApmeConnectionError(ctx.error.message)) {
    return <ApmeUnavailable message={APME_GATEWAY_UNAVAILABLE_MESSAGE} />;
  }

  if (!ctx.project) {
    return (
      <Card variant="outlined" className={classes.card}>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>
            Quality
          </Typography>
          <Typography variant="body2" color="textSecondary" paragraph>
            No quality scans yet. Quality scans run on push when the APME
            workflow is configured, or use Scan to check this repository now.
          </Typography>
          <Button
            size="small"
            variant="contained"
            color="primary"
            disabled={!ctx.repoUrl}
            startIcon={<RefreshIcon />}
            onClick={() => navigateToQuality()}
          >
            Scan
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (totalViolations === 0) {
    return (
      <Card variant="outlined" className={classes.card}>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>
            Quality
          </Typography>
          <Typography
            variant="body2"
            style={{ color: colorTokens.dependencyViolation.okCheckColor }}
          >
            No violations detected on the latest scan.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const worstSev =
    SEV_ORDER.find(s => sevCounts[s] > 0) ?? ('info' as SeverityLevel);

  return (
    <Card variant="outlined" className={classes.card}>
      <CardContent style={{ padding: '14px 16px 12px' }}>
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          mb={1}
        >
          <Typography
            style={{
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: theme.palette.text.secondary,
            }}
          >
            Quality
          </Typography>
          <Typography
            component="span"
            style={{
              fontSize: 12,
              color: theme.palette.primary.main,
              cursor: 'pointer',
            }}
            onClick={() => navigateToQuality()}
          >
            View details →
          </Typography>
        </Box>

        <Box
          display="flex"
          alignItems="baseline"
          style={{ gap: 6, marginBottom: 4 }}
        >
          <Typography
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: colorTokens.severity[worstSev].inlineText,
              lineHeight: 1,
            }}
          >
            {totalViolations}
          </Typography>
          <Typography
            style={{ fontSize: 12, color: theme.palette.text.secondary }}
          >
            violation{totalViolations !== 1 ? 's' : ''} · {fixable} fixable
          </Typography>
        </Box>

        <Box
          display="flex"
          style={{
            height: 6,
            borderRadius: 3,
            overflow: 'hidden',
            marginBottom: 8,
          }}
        >
          {SEV_ORDER.map(sev => {
            const count = sevCounts[sev];
            if (!count) return null;
            return (
              <Box
                key={sev}
                style={{
                  flex: count,
                  backgroundColor: colorTokens.severity[sev].barFill,
                }}
              />
            );
          })}
        </Box>

        <Box
          display="flex"
          flexWrap="wrap"
          style={{ gap: '2px 10px', marginBottom: 10 }}
        >
          {SEV_ORDER.map(sev => {
            const count = sevCounts[sev];
            if (!count) return null;
            return (
              <Typography
                key={sev}
                style={{ fontSize: 11, color: theme.palette.text.secondary }}
              >
                <strong style={{ color: colorTokens.severity[sev].inlineText }}>
                  {count}
                </strong>{' '}
                <span style={{ textTransform: 'capitalize' }}>{sev}</span>
              </Typography>
            );
          })}
        </Box>

        {CATEGORY_META.map(({ key, label, tip }) => {
          const count = catCounts[key] ?? 0;
          if (!count) return null;
          const catBySev = categorySeverityBreakdown(
            ctx.violations,
            key,
            ctx.rulesById,
          );
          const pct = (count / totalViolations) * 100;
          const isDark = theme.palette.type === 'dark';
          const trackColor = isDark ? 'rgba(255,255,255,0.08)' : '#e8e8e8';
          return (
            <Box
              key={key}
              className={classes.categoryRow}
              onClick={() => navigateToQuality(key)}
            >
              <Typography
                component="span"
                style={{
                  fontSize: 12,
                  color: theme.palette.text.primary,
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  width: 130,
                }}
              >
                {label}
                <Tooltip title={tip} arrow enterDelay={200}>
                  <HelpOutlineIcon
                    style={{
                      fontSize: 13,
                      color: theme.palette.text.disabled,
                      cursor: 'help',
                    }}
                  />
                </Tooltip>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '1px 7px',
                    borderRadius: 10,
                    backgroundColor: isDark
                      ? 'rgba(255,255,255,0.08)'
                      : 'rgba(0,0,0,0.06)',
                    color: theme.palette.text.secondary,
                    marginLeft: 2,
                  }}
                >
                  {count}
                </span>
              </Typography>
              <Box
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: trackColor,
                  overflow: 'hidden',
                }}
              >
                <Box
                  display="flex"
                  style={{ height: '100%', width: `${pct}%`, borderRadius: 3 }}
                >
                  {SEV_ORDER.map(sev => {
                    const n = catBySev[sev];
                    if (!n) return null;
                    return (
                      <Box
                        key={sev}
                        style={{
                          flex: n,
                          backgroundColor: colorTokens.severity[sev].barFill,
                        }}
                      />
                    );
                  })}
                </Box>
              </Box>
            </Box>
          );
        })}
      </CardContent>
    </Card>
  );
};
