/*
 * Copyright Red Hat
 *
 * Fleet quality overview — aligned with ansible-portal-prototypes
 * `design/apme-integration` → QualityOverviewContent.tsx
 */

import { useMemo, useState, type MouseEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import {
  Box,
  Card,
  Chip,
  Collapse,
  IconButton,
  Link,
  Tooltip,
  Typography,
  makeStyles,
  useTheme,
} from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';
import KeyboardArrowDownIcon from '@material-ui/icons/KeyboardArrowDown';
import { Progress } from '@backstage/core-components';
import type { Project } from '@ansible/backstage-apme-common/types';
import {
  SEVERITY_STYLES,
  normalizeSeverity,
  categoryLabel,
  fixTierShortLabel,
  type SeverityLevel,
} from '@ansible/backstage-apme-common/severity';
import { apmeApiRef } from '../../api';
import { projectLookupKey } from '@ansible/backstage-rhaap-common/catalogEntity';
import { useApmeEnabled, useApmeAiEnabled } from '../../hooks/useApmeEnabled';
import { PreviewChip } from '../PreviewChip';

const STATUS_ERROR = '#C9190B';
const STATUS_SUCCESS = '#3E8635';

const SEVERITY_WEIGHT: Record<SeverityLevel, number> = {
  critical: 50,
  high: 20,
  medium: 5,
  low: 2,
  info: 1,
};

const FIX_TIER_COLORS: Record<string, { light: string; dark: string }> = {
  auto: { light: '#1a7f37', dark: '#3fb950' },
  ai: { light: '#6753ac', dark: '#a78bfa' },
  manual: { light: '#6b7280', dark: '#9ca3af' },
};

const useStyles = makeStyles(theme => ({
  summaryBar: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: theme.spacing(1),
  },
  sevBar: {
    display: 'flex',
    gap: 12,
    marginBottom: theme.spacing(2),
    flexWrap: 'wrap',
  },
  sevItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 0.15s',
    border: '1px solid transparent',
  },
  sevItemActive: {
    border: '1px solid',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
    '& thead': {
      backgroundColor:
        theme.palette.type === 'dark' ? 'rgba(255,255,255,0.04)' : '#f5f5f5',
      borderBottom: `1px solid ${theme.palette.divider}`,
    },
    '& th': {
      textAlign: 'left',
      padding: '10px 12px',
      fontWeight: 600,
      fontSize: 12,
      color: theme.palette.text.secondary,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      cursor: 'pointer',
      userSelect: 'none',
      '&:hover': { color: theme.palette.text.primary },
    },
    '& td': {
      padding: '10px 12px',
      borderBottom: `1px solid ${theme.palette.divider}`,
      verticalAlign: 'middle',
    },
    '& tbody tr:last-child td': {
      borderBottom: 'none',
    },
    '& tbody tr:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
  },
  studyNote: {
    marginTop: theme.spacing(2),
    fontStyle: 'italic',
    color: theme.palette.text.secondary,
  },
}));

type SortColumn = 'impact' | 'severity' | 'repos' | 'occurrences' | 'category';

export interface FleetQualityTabProps {
  repositoryDetailPath: (entityName: string, ruleId?: string) => string;
}

type FleetRepoRow = {
  project: Project;
  entityName: string;
  count: number;
  remediationClass: number;
  lastScannedAt?: string;
};

type RuleAggregate = {
  ruleId: string;
  message: string;
  level: string;
  category?: string;
  repos: FleetRepoRow[];
  totalCount: number;
};

function entityProjectLookupKey(entity: Entity): string | undefined {
  const loc =
    entity.metadata?.annotations?.['backstage.io/source-location'] ??
    entity.metadata?.annotations?.['ansible.com/repository-url'];
  if (!loc) return undefined;
  const match = loc.match(/url:(https?:\/\/[^\s]+)/);
  const repoUrl = match ? match[1] : loc.replace(/^url:/, '');
  const spec = entity.spec as
    { repository_default_branch?: string } | undefined;
  const branch = spec?.repository_default_branch ?? 'main';
  return projectLookupKey(repoUrl, branch);
}

function fixTierColor(
  remClass: number,
  enableAi: boolean,
  isDark: boolean,
): string {
  const label = fixTierShortLabel(remClass, enableAi);
  if (label === 'Auto-fix') {
    return isDark ? FIX_TIER_COLORS.auto.dark : FIX_TIER_COLORS.auto.light;
  }
  if (label === 'AI-fix') {
    return isDark ? FIX_TIER_COLORS.ai.dark : FIX_TIER_COLORS.ai.light;
  }
  return isDark ? FIX_TIER_COLORS.manual.dark : FIX_TIER_COLORS.manual.light;
}

export const FleetQualityTab = ({
  repositoryDetailPath,
}: FleetQualityTabProps) => {
  const classes = useStyles();
  const theme = useTheme();
  const isDark = theme.palette.type === 'dark';
  const apmeApi = useApi(apmeApiRef);
  const catalogApi = useApi(catalogApiRef);
  const enabled = useApmeEnabled();
  const enableAi = useApmeAiEnabled();

  const [severityFilters, setSeverityFilters] = useState<Set<SeverityLevel>>(
    new Set(),
  );
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(
    new Set(),
  );
  const [sortCol, setSortCol] = useState<SortColumn>('impact');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);

  const { value, loading } = useAsync(async () => {
    if (!enabled) {
      return {
        groups: [] as RuleAggregate[],
        reposWithIssues: 0,
        totalRepos: 0,
        violationTotal: 0,
        severityCounts: {} as Record<SeverityLevel, number>,
      };
    }

    const [projects, catalogResponse] = await Promise.all([
      apmeApi.getProjects(),
      catalogApi.getEntities({
        filter: [{ kind: 'Component', 'spec.type': 'git-repository' }],
      }),
    ]);

    const entities = Array.isArray(catalogResponse)
      ? catalogResponse
      : (catalogResponse.items ?? []);

    const entityByProjectKey = new Map<string, string>();
    for (const entity of entities) {
      const key = entityProjectLookupKey(entity);
      if (key && entity.metadata?.name) {
        entityByProjectKey.set(key, entity.metadata.name);
      }
    }

    const totalRepos = Math.max(entities.length, projects.length);
    const scanned = projects.filter(p => p.total_violations > 0);
    const violationsByProject = await Promise.all(
      scanned.map(async project => ({
        project,
        violations: await apmeApi.getViolations(project.id),
      })),
    );

    const ruleMap = new Map<string, RuleAggregate>();
    const severityCounts: Record<SeverityLevel, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    for (const { project, violations } of violationsByProject) {
      const projectKey = projectLookupKey(project.repo_url, project.branch);
      const entityName =
        entityByProjectKey.get(projectKey) ??
        project.name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();

      for (const v of violations) {
        const sev = normalizeSeverity(v.level);
        severityCounts[sev] = (severityCounts[sev] ?? 0) + 1;

        const existing = ruleMap.get(v.rule_id);
        if (!existing) {
          ruleMap.set(v.rule_id, {
            ruleId: v.rule_id,
            message: v.message,
            level: v.level,
            category: v.category,
            repos: [
              {
                project,
                entityName,
                count: 1,
                remediationClass: v.remediation_class,
                lastScannedAt: project.last_scanned_at,
              },
            ],
            totalCount: 1,
          });
        } else {
          existing.totalCount += 1;
          const repo = existing.repos.find(r => r.project.id === project.id);
          if (repo) {
            repo.count += 1;
          } else {
            existing.repos.push({
              project,
              entityName,
              count: 1,
              remediationClass: v.remediation_class,
              lastScannedAt: project.last_scanned_at,
            });
          }
        }
      }
    }

    const groups = Array.from(ruleMap.values());
    const violationTotal = groups.reduce((sum, g) => sum + g.totalCount, 0);
    const reposWithIssues = new Set(
      groups.flatMap(g => g.repos.map(r => r.project.id)),
    ).size;

    return {
      groups,
      reposWithIssues,
      totalRepos,
      violationTotal,
      severityCounts,
    };
  }, [enabled, apmeApi, catalogApi]);

  const filteredGroups = useMemo(() => {
    let result = value?.groups ?? [];
    if (severityFilters.size > 0) {
      result = result.filter(g =>
        severityFilters.has(normalizeSeverity(g.level)),
      );
    }
    if (categoryFilters.size > 0) {
      result = result.filter(
        g => g.category && categoryFilters.has(g.category),
      );
    }
    return result;
  }, [value?.groups, severityFilters, categoryFilters]);

  const sortedGroups = useMemo(() => {
    const sevOrder: Record<SeverityLevel, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4,
    };

    return [...filteredGroups].sort((a, b) => {
      let cmp = 0;
      const sevA = normalizeSeverity(a.level);
      const sevB = normalizeSeverity(b.level);
      switch (sortCol) {
        case 'impact':
          cmp =
            SEVERITY_WEIGHT[sevB] * b.repos.length -
            SEVERITY_WEIGHT[sevA] * a.repos.length;
          break;
        case 'severity':
          cmp = sevOrder[sevA] - sevOrder[sevB];
          break;
        case 'repos':
          cmp = b.repos.length - a.repos.length;
          break;
        case 'occurrences':
          cmp = b.totalCount - a.totalCount;
          break;
        case 'category':
          cmp = (a.category ?? '').localeCompare(b.category ?? '');
          break;
        default:
          cmp = 0;
      }
      return sortAsc ? -cmp : cmp;
    });
  }, [filteredGroups, sortCol, sortAsc]);

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  const toggleSeverity = (sev: SeverityLevel) => {
    setSeverityFilters(prev => {
      const next = new Set(prev);
      if (next.has(sev)) {
        next.delete(sev);
      } else {
        next.add(sev);
      }
      return next;
    });
  };

  const toggleCategory = (cat: string) => {
    setCategoryFilters(prev => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  if (!enabled) {
    return (
      <Typography variant="body2" color="textSecondary">
        Content quality scanning is disabled. Enable ansible.apme.enabled in
        configuration.
      </Typography>
    );
  }

  if (loading) {
    return <Progress />;
  }

  const violationTotal = value?.violationTotal ?? 0;
  const reposWithIssues = value?.reposWithIssues ?? 0;
  const totalRepos = value?.totalRepos ?? 0;
  const reposClean = Math.max(0, totalRepos - reposWithIssues);
  const severityCounts = value?.severityCounts ?? {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  const allRules = value?.groups ?? [];
  const hasFilter = severityFilters.size > 0 || categoryFilters.size > 0;
  const filteredViolationCount = sortedGroups.reduce(
    (s, r) => s + r.totalCount,
    0,
  );
  const sevOrder: SeverityLevel[] = [
    'critical',
    'high',
    'medium',
    'low',
    'info',
  ];
  const sortArrow = (col: SortColumn): string => {
    if (sortCol !== col) return '';
    return sortAsc ? ' ↑' : ' ↓';
  };

  return (
    <Box>
      <Box className={classes.titleRow}>
        <Typography variant="h6">Fleet quality</Typography>
        <Box display="flex" alignItems="center" style={{ gap: 12 }}>
          <Link
            component={RouterLink}
            to="/self-service/repositories/quality-settings?section=rules"
            style={{ fontSize: 13 }}
          >
            All rules catalog →
          </Link>
          <PreviewChip />
        </Box>
      </Box>

      <Box className={classes.summaryBar}>
        <Typography
          style={{ fontSize: 20, fontWeight: 700, color: STATUS_ERROR }}
        >
          {hasFilter ? filteredViolationCount : violationTotal}
        </Typography>
        <Typography
          style={{ fontSize: 13, color: theme.palette.text.secondary }}
        >
          {hasFilter
            ? `of ${violationTotal} violations · ${sortedGroups.length} rule${sortedGroups.length !== 1 ? 's' : ''} · ${reposWithIssues} repositories`
            : `violations · ${allRules.length} rules · ${reposWithIssues} repositories`}
          {reposClean > 0 && !hasFilter && (
            <span style={{ marginLeft: 6 }}>
              ·{' '}
              <span style={{ color: STATUS_SUCCESS, fontWeight: 500 }}>
                {reposClean} clean
              </span>
            </span>
          )}
        </Typography>
      </Box>

      <Box className={classes.sevBar}>
        {sevOrder.map(sev => {
          const count = severityCounts[sev];
          if (count === 0) {
            return null;
          }
          const isActive = severityFilters.has(sev);
          const isDimmed = hasFilter && !isActive && severityFilters.size > 0;
          const color = SEVERITY_STYLES[sev].background;
          return (
            <Box
              key={sev}
              className={`${classes.sevItem} ${isActive ? classes.sevItemActive : ''}`}
              style={{
                backgroundColor: isActive ? `${color}12` : undefined,
                borderColor: isActive ? `${color}60` : undefined,
                opacity: isDimmed ? 0.45 : 1,
              }}
              onClick={() => toggleSeverity(sev)}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  toggleSeverity(sev);
                }
              }}
            >
              <Box
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  backgroundColor: color,
                }}
              />
              <Typography
                style={{
                  fontSize: 12,
                  textTransform: 'capitalize',
                  color: isActive ? color : theme.palette.text.secondary,
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {sev}
              </Typography>
              <Typography style={{ fontSize: 12, fontWeight: 700, color }}>
                {count}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {hasFilter && (
        <Box
          display="flex"
          alignItems="center"
          style={{ marginBottom: 12, gap: 8 }}
        >
          <Typography
            style={{ fontSize: 12, color: theme.palette.text.secondary }}
          >
            Showing {filteredViolationCount} of {violationTotal} violations
          </Typography>
          {Array.from(categoryFilters).map(cat => (
            <Chip
              key={cat}
              size="small"
              label={categoryLabel(cat)}
              onDelete={() => toggleCategory(cat)}
              style={{ height: 20, fontSize: 11, fontWeight: 600 }}
            />
          ))}
          <span
            role="button"
            tabIndex={0}
            onClick={() => {
              setSeverityFilters(new Set());
              setCategoryFilters(new Set());
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                setSeverityFilters(new Set());
                setCategoryFilters(new Set());
              }
            }}
            style={{
              fontSize: 12,
              color: theme.palette.primary.main,
              cursor: 'pointer',
            }}
          >
            Clear filters
          </span>
        </Box>
      )}

      <Card variant="outlined" style={{ borderRadius: 8, overflow: 'hidden' }}>
        <Box style={{ overflow: 'auto' }}>
          <table className={classes.table}>
            <thead>
              <tr>
                <th style={{ width: 36, padding: '10px 4px' }} />
                <th
                  style={{ width: 100 }}
                  onClick={() => handleSort('severity')}
                >
                  Severity{sortArrow('severity')}
                </th>
                <th onClick={() => handleSort('impact')}>
                  Rule{sortArrow('impact')}
                </th>
                <th
                  style={{ width: 110 }}
                  onClick={() => handleSort('category')}
                >
                  Category{sortArrow('category')}
                </th>
                <th style={{ width: 72 }} onClick={() => handleSort('repos')}>
                  Repos{sortArrow('repos')}
                </th>
                <th
                  style={{ width: 100 }}
                  onClick={() => handleSort('occurrences')}
                >
                  Occurrences{sortArrow('occurrences')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedGroups.map(group => {
                const sev = normalizeSeverity(group.level);
                const color = SEVERITY_STYLES[sev].background;
                const isExpanded = expandedRule === group.ruleId;

                return [
                  <tr
                    key={group.ruleId}
                    onClick={() =>
                      setExpandedRule(isExpanded ? null : group.ruleId)
                    }
                    style={{
                      cursor: 'pointer',
                      ...(isExpanded
                        ? {
                            backgroundColor: isDark
                              ? 'rgba(255,255,255,0.03)'
                              : 'rgba(0,0,0,0.015)',
                          }
                        : {}),
                    }}
                  >
                    <td style={{ width: 36, padding: '8px 4px' }}>
                      <IconButton size="small">
                        {isExpanded ? (
                          <KeyboardArrowDownIcon />
                        ) : (
                          <ChevronRightIcon />
                        )}
                      </IconButton>
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 3,
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: 0.3,
                          whiteSpace: 'nowrap',
                          backgroundColor: sev === 'medium' ? '#c58c00' : color,
                          color: '#fff',
                        }}
                      >
                        {group.totalCount} {sev}
                      </span>
                    </td>
                    <td>
                      <Tooltip
                        title={`Rule ID: ${group.ruleId}`}
                        arrow
                        enterDelay={400}
                      >
                        <Typography style={{ fontSize: 13 }}>
                          {group.message}
                        </Typography>
                      </Tooltip>
                    </td>
                    <td>
                      {group.category ? (
                        <Typography
                          onClick={(e: MouseEvent) => {
                            e.stopPropagation();
                            toggleCategory(group.category!);
                          }}
                          style={{
                            fontSize: 11,
                            color: categoryFilters.has(group.category)
                              ? theme.palette.primary.main
                              : theme.palette.text.secondary,
                            cursor: 'pointer',
                            fontWeight: categoryFilters.has(group.category)
                              ? 600
                              : 400,
                          }}
                        >
                          {categoryLabel(group.category)}
                        </Typography>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <Typography style={{ fontSize: 13, fontWeight: 500 }}>
                        {group.repos.length}
                      </Typography>
                    </td>
                    <td>
                      <Typography style={{ fontSize: 13, fontWeight: 500 }}>
                        {group.totalCount}
                      </Typography>
                    </td>
                  </tr>,
                  isExpanded ? (
                    <tr key={`${group.ruleId}-repos`}>
                      <td
                        colSpan={6}
                        style={{
                          padding: 0,
                          backgroundColor: isDark
                            ? 'rgba(255,255,255,0.02)'
                            : '#fafafa',
                        }}
                      >
                        <Collapse in={isExpanded}>
                          <Box style={{ padding: '4px 0 4px 52px' }}>
                            {group.repos.map(r => (
                              <Box
                                key={r.project.id}
                                display="flex"
                                alignItems="center"
                                style={{
                                  padding: '6px 12px',
                                  borderBottom: `1px solid ${theme.palette.divider}`,
                                  gap: 12,
                                }}
                              >
                                <Box
                                  display="flex"
                                  alignItems="center"
                                  style={{ gap: 6, flex: 1, minWidth: 0 }}
                                >
                                  <Typography
                                    style={{ fontSize: 12, fontWeight: 500 }}
                                  >
                                    {r.project.name}
                                  </Typography>
                                  {r.count > 1 && (
                                    <Chip
                                      size="small"
                                      label={`×${r.count}`}
                                      style={{
                                        fontSize: 10,
                                        height: 16,
                                        fontWeight: 600,
                                      }}
                                    />
                                  )}
                                </Box>
                                <Typography
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 500,
                                    color: fixTierColor(
                                      r.remediationClass,
                                      enableAi,
                                      isDark,
                                    ),
                                    flexShrink: 0,
                                  }}
                                >
                                  {fixTierShortLabel(
                                    r.remediationClass,
                                    enableAi,
                                  )}
                                </Typography>
                                <Typography
                                  style={{
                                    fontSize: 11,
                                    color: theme.palette.text.secondary,
                                    flexShrink: 0,
                                  }}
                                >
                                  {r.lastScannedAt ?? '—'}
                                </Typography>
                                <Link
                                  href={repositoryDetailPath(
                                    r.entityName,
                                    group.ruleId,
                                  )}
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 500,
                                    flexShrink: 0,
                                  }}
                                  onClick={(e: MouseEvent) =>
                                    e.stopPropagation()
                                  }
                                >
                                  View details →
                                </Link>
                              </Box>
                            ))}
                          </Box>
                        </Collapse>
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </Box>
      </Card>

      {sortedGroups.length === 0 && (
        <Box style={{ textAlign: 'center', padding: '48px 24px' }}>
          {hasFilter ? (
            <Typography
              style={{ fontSize: 14, color: theme.palette.text.secondary }}
            >
              No violations match the current filters.
            </Typography>
          ) : (
            <>
              <CheckCircleIcon
                style={{ fontSize: 40, color: STATUS_SUCCESS, marginBottom: 8 }}
              />
              <Typography style={{ fontSize: 16, fontWeight: 500 }}>
                All repositories are clean
              </Typography>
            </>
          )}
        </Box>
      )}

      <Typography variant="caption" className={classes.studyNote}>
        Fleet Quality view — UX study target; release scope TBD (Inc 10).
      </Typography>
    </Box>
  );
};
