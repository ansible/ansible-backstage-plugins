import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Link, Paper, Typography } from '@material-ui/core';
import { useTheme } from '@material-ui/core/styles';
import Autocomplete from '@material-ui/lab/Autocomplete';
import TextField from '@material-ui/core/TextField';
import CheckCircleOutline from '@material-ui/icons/CheckCircleOutline';
import CancelOutlined from '@material-ui/icons/CancelOutlined';
import NotInterestedOutlined from '@material-ui/icons/NotInterestedOutlined';
import SyncOutlined from '@material-ui/icons/SyncOutlined';
import ScheduleOutlined from '@material-ui/icons/ScheduleOutlined';
import BlockOutlined from '@material-ui/icons/BlockOutlined';
import HelpOutline from '@material-ui/icons/HelpOutline';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import {
  catalogApiRef,
  CatalogFilterLayout,
} from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import { Progress, Table, TableColumn } from '@backstage/core-components';
import {
  useCollectionsStyles,
  useTableWrapperStyles,
} from '../CollectionsCatalog/styles';
import { formatTimeAgo, getSourceUrl } from '../CollectionsCatalog/utils';
import {
  getGitHubOwnerRepo,
  getGitLabProjectPath,
  getProjectDisplayName,
} from './scmUtils';

export type CIActivityRow = {
  id: string;
  status:
    | 'success'
    | 'failure'
    | 'cancelled'
    | 'in_progress'
    | 'queued'
    | 'skipped'
    | 'unknown';
  project: string;
  projectUrl?: string;
  event: string;
  eventDisplay: string;
  trigger: string;
  time: string;
  runUrl?: string;
};

function normalizeGitLabStatus(
  s: string | undefined | null,
): CIActivityRow['status'] {
  const status = (s ?? 'unknown').toLowerCase();
  const map: Record<string, CIActivityRow['status']> = {
    success: 'success',
    failed: 'failure',
    canceled: 'cancelled',
    cancelled: 'cancelled',
    running: 'in_progress',
    pending: 'in_progress',
    skipped: 'skipped',
  };
  return map[status] ?? 'unknown';
}

const STATUS_LABELS: Record<CIActivityRow['status'], string> = {
  success: 'Success',
  failure: 'Failure',
  cancelled: 'Cancelled',
  in_progress: 'In Progress',
  queued: 'Queued',
  skipped: 'Skipped',
  unknown: 'Unknown',
};

export interface RepositoriesCIActivityTabProps {
  filterByEntity?: Entity | null;
}

export const RepositoriesCIActivityTab = ({
  filterByEntity,
}: RepositoriesCIActivityTabProps = {}) => {
  const theme = useTheme();
  const classes = useCollectionsStyles();
  const tableWrapperClasses = useTableWrapperStyles();
  const catalogApi = useApi(catalogApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const identityApi = useApi(identityApiRef);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CIActivityRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [triggerFilter, setTriggerFilter] = useState<string>('All');

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRows([]);

    try {
      let entities: Entity[];
      if (filterByEntity) {
        entities = [filterByEntity];
      } else {
        const response = await catalogApi.getEntities({
          filter: [{ kind: 'Component', 'spec.type': 'git-repository' }],
        });
        entities = Array.isArray(response) ? response : (response?.items ?? []);
      }
      const githubEntities = entities.filter(
        (e): e is Entity => getGitHubOwnerRepo(e) !== null,
      );
      const gitlabEntities = entities.filter(
        (e): e is Entity => getGitLabProjectPath(e) !== null,
      );

      const allRows: CIActivityRow[] = [];
      const runsPerRepo = 15;

      const backstageCreds = await identityApi
        .getCredentials()
        .catch(() => ({ token: undefined }));

      await Promise.all(
        githubEntities.map(async entity => {
          const gh = getGitHubOwnerRepo(entity);
          const projectName = getProjectDisplayName(entity);
          if (!gh) return;
          const repoUrl = getSourceUrl(entity);
          let host = 'github.com';
          if (repoUrl) {
            try {
              host = new URL(repoUrl).hostname;
            } catch {
              // keep github.com
            }
          }
          try {
            const catalogBase = await discoveryApi.getBaseUrl('catalog');
            const proxyUrl = `${catalogBase}/ansible/git/ci-activity?provider=github&owner=${encodeURIComponent(gh.owner)}&repo=${encodeURIComponent(gh.repo)}&host=${encodeURIComponent(host)}&per_page=${runsPerRepo}`;
            const headers: Record<string, string> = {};
            if (backstageCreds?.token) {
              headers.Authorization = `Bearer ${backstageCreds.token}`;
            }
            const res = await fetchApi.fetch(proxyUrl, {
              headers,
              credentials: 'include',
            });
            if (!res.ok) return;
            const data: {
              workflow_runs?: Array<{
                id: number;
                run_number?: number;
                name?: string | null;
                status?: string | null;
                conclusion?: string | null;
                event?: string | null;
                created_at?: string | null;
                html_url?: string | null;
              }>;
            } = await res.json();
            const runs = data.workflow_runs ?? [];
            const baseUrl = (repoUrl ?? '').replace(/\.git$/i, '');
            const projectUrl = baseUrl ? `${baseUrl}/actions` : undefined;
            runs.forEach(run => {
              const status = (
                run.conclusion ??
                run.status ??
                'unknown'
              ).toLowerCase();
              const trigger = (run.event ?? 'unknown').replaceAll('_', ' ');
              const eventName = run.name ?? 'Workflow';
              const runNum = run.run_number ?? run.id;
              allRows.push({
                id: `gh-${entity.metadata?.name ?? ''}-${run.id}`,
                status: ([
                  'success',
                  'failure',
                  'cancelled',
                  'in_progress',
                  'queued',
                  'skipped',
                ].includes(status)
                  ? status
                  : 'unknown') as CIActivityRow['status'],
                project: projectName,
                projectUrl,
                event: eventName,
                eventDisplay: `${eventName} #${runNum}`,
                trigger,
                time: run.created_at ?? '',
                runUrl: run.html_url ?? undefined,
              });
            });
          } catch {
            // Per-repo errors (e.g. 404, auth) skip that repo
            // silently fail
          }
        }),
      );

      await Promise.all(
        gitlabEntities.map(async entity => {
          const path = getGitLabProjectPath(entity);
          const projectName = getProjectDisplayName(entity);
          const repoUrl = getSourceUrl(entity);
          if (!path || !repoUrl) return;
          try {
            const baseUrl = repoUrl.replace(/\.git$/i, '');
            const projectUrl = `${baseUrl}/-/pipelines`;
            let host: string;
            try {
              const url = new URL(repoUrl);
              host = url.hostname;
            } catch {
              return;
            }
            const catalogBase = await discoveryApi.getBaseUrl('catalog');
            const proxyUrl = `${catalogBase}/ansible/git/ci-activity?provider=gitlab&projectPath=${encodeURIComponent(path)}&host=${encodeURIComponent(host)}&per_page=${runsPerRepo}`;
            const headers: Record<string, string> = {};
            if (backstageCreds?.token) {
              headers.Authorization = `Bearer ${backstageCreds.token}`;
            }
            const res = await fetchApi.fetch(proxyUrl, {
              headers,
              credentials: 'include',
            });
            if (!res.ok) return;
            const pipelines: Array<{
              id: number;
              status?: string | null;
              source?: string | null;
              created_at?: string | null;
              web_url?: string | null;
              ref?: string | null;
            }> = await res.json();
            pipelines.forEach(pipeline => {
              const trigger = (pipeline.source ?? 'unknown').replaceAll(
                '_',
                ' ',
              );
              allRows.push({
                id: `gl-${entity.metadata?.name ?? ''}-${pipeline.id}`,
                status: normalizeGitLabStatus(pipeline.status),
                project: projectName,
                projectUrl,
                event: 'Pipeline',
                eventDisplay: `Pipeline #${pipeline.id}`,
                trigger,
                time: pipeline.created_at ?? '',
                runUrl: pipeline.web_url ?? undefined,
              });
            });
          } catch {
            // Per-repo errors (e.g. 404, auth) skip that repo
          }
        }),
      );

      allRows.sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
      );
      setRows(allRows.slice(0, 150));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load CI activity');
    } finally {
      setLoading(false);
    }
  }, [catalogApi, discoveryApi, fetchApi, identityApi, filterByEntity]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  const statusOptions = useMemo(() => {
    const statuses = Array.from(new Set(rows.map(r => r.status))).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
    return ['All', ...statuses];
  }, [rows]);

  const triggerOptions = useMemo(() => {
    const triggers = Array.from(new Set(rows.map(r => r.trigger))).sort(
      (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
    return ['All', ...triggers];
  }, [rows]);

  const filteredRows = useMemo(
    () =>
      rows.filter(
        row =>
          (statusFilter === 'All' || row.status === statusFilter) &&
          (triggerFilter === 'All' || row.trigger === triggerFilter),
      ),
    [rows, statusFilter, triggerFilter],
  );

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <Box className={classes.emptyStateContainer}>
        <Box className={classes.emptyState}>
          <Typography
            variant="h4"
            className={classes.emptyStateTitle}
            style={{ fontSize: '1.75rem' }}
          >
            Unable to load CI activity
          </Typography>
          <Typography
            variant="body1"
            className={classes.emptyStateDescription}
            style={{ fontSize: '1.125rem' }}
          >
            {error}
          </Typography>
        </Box>
      </Box>
    );
  }

  if (rows.length === 0) {
    return (
      <Box className={classes.emptyStateContainer}>
        <Box className={classes.emptyState}>
          <Typography
            variant="h4"
            className={classes.emptyStateTitle}
            style={{ fontSize: '1.75rem' }}
          >
            No CI activity yet
          </Typography>
          <Typography
            variant="body1"
            className={classes.emptyStateDescription}
            style={{ fontSize: '1.125rem' }}
          >
            {filterByEntity
              ? 'CI activity for this repository will appear here after workflow or pipeline runs.'
              : 'CI activity from your GitHub and GitLab repositories will appear here after workflow or pipeline runs. Configure GitHub OAuth and GitLab integration in Backstage to see data.'}
          </Typography>
        </Box>
      </Box>
    );
  }

  const getStatusIcon = (status: CIActivityRow['status']) => {
    const iconProps = { style: { fontSize: 20 }, 'aria-hidden': true as const };
    const grey = theme.palette.grey[600];
    switch (status) {
      case 'success':
        return (
          <CheckCircleOutline
            {...iconProps}
            style={{ ...iconProps.style, color: theme.palette.success.main }}
          />
        );
      case 'failure':
        return (
          <CancelOutlined
            {...iconProps}
            style={{ ...iconProps.style, color: theme.palette.error.main }}
          />
        );
      case 'cancelled':
        return (
          <NotInterestedOutlined
            {...iconProps}
            style={{ ...iconProps.style, color: grey }}
          />
        );
      case 'in_progress':
        return (
          <SyncOutlined
            {...iconProps}
            className={tableWrapperClasses.statusIconSpinning}
            style={{ ...iconProps.style, color: theme.palette.info.main }}
          />
        );
      case 'queued':
        return (
          <ScheduleOutlined
            {...iconProps}
            style={{ ...iconProps.style, color: theme.palette.warning.main }}
          />
        );
      case 'skipped':
        return (
          <BlockOutlined
            {...iconProps}
            style={{ ...iconProps.style, color: grey }}
          />
        );
      default:
        return (
          <HelpOutline
            {...iconProps}
            style={{ ...iconProps.style, color: grey }}
          />
        );
    }
  };

  const columns: TableColumn<CIActivityRow>[] = [
    {
      title: 'Status',
      field: 'status',
      width: '16%',
      render: (row: CIActivityRow) => (
        <Box className={tableWrapperClasses.statusCell}>
          {getStatusIcon(row.status)}
          <Typography variant="body2" color="textPrimary">
            {STATUS_LABELS[row.status]}
          </Typography>
        </Box>
      ),
    },
    {
      title: 'Project',
      field: 'project',
      width: '26%',
      highlight: true,
      render: (row: CIActivityRow) =>
        row.projectUrl ? (
          <Link
            href={row.projectUrl}
            target="_blank"
            rel="noopener noreferrer"
            color="primary"
          >
            {row.project}
          </Link>
        ) : (
          row.project
        ),
    },
    {
      title: 'Event',
      field: 'eventDisplay',
      width: '22%',
      render: (row: CIActivityRow) =>
        row.runUrl ? (
          <Link
            href={row.runUrl}
            target="_blank"
            rel="noopener noreferrer"
            color="primary"
          >
            {row.eventDisplay}
          </Link>
        ) : (
          row.eventDisplay
        ),
    },
    {
      title: 'Trigger',
      field: 'trigger',
      width: '18%',
    },
    {
      title: 'Time',
      field: 'time',
      width: '18%',
      render: (row: CIActivityRow) => (
        <Typography variant="body2">
          {row.time ? formatTimeAgo(row.time) : '—'}
        </Typography>
      ),
    },
  ];

  return (
    <div style={{ flexDirection: 'column', width: '100%' }}>
      <CatalogFilterLayout>
        <CatalogFilterLayout.Filters>
          <Box className={tableWrapperClasses.filterGroup}>
            <Typography
              style={{ marginBottom: 8, fontWeight: 600, fontSize: '0.875rem' }}
            >
              Status
            </Typography>
            <Paper className={tableWrapperClasses.paper}>
              <Autocomplete
                options={statusOptions}
                value={statusFilter}
                onChange={(_event, newValue) =>
                  setStatusFilter(newValue ?? 'All')
                }
                getOptionLabel={opt =>
                  opt === 'All' ? 'All' : opt.replaceAll('_', ' ')
                }
                renderInput={params => (
                  <TextField
                    {...params}
                    placeholder="All"
                    variant="standard"
                    size="small"
                    InputProps={{
                      ...params.InputProps,
                      disableUnderline: true,
                      style: { fontSize: '0.875rem' },
                    }}
                  />
                )}
                disableClearable={statusFilter === 'All'}
                size="small"
                fullWidth
              />
            </Paper>
          </Box>
          <Box className={tableWrapperClasses.filterGroup}>
            <Typography
              style={{ marginBottom: 8, fontWeight: 600, fontSize: '0.875rem' }}
            >
              Trigger
            </Typography>
            <Paper className={tableWrapperClasses.paper}>
              <Autocomplete
                options={triggerOptions}
                value={triggerFilter}
                onChange={(_event, newValue) =>
                  setTriggerFilter(newValue ?? 'All')
                }
                getOptionLabel={opt => (opt === 'All' ? 'All' : opt)}
                renderInput={params => (
                  <TextField
                    {...params}
                    placeholder="All"
                    variant="standard"
                    size="small"
                    InputProps={{
                      ...params.InputProps,
                      disableUnderline: true,
                      style: { fontSize: '0.875rem' },
                    }}
                  />
                )}
                disableClearable={triggerFilter === 'All'}
                size="small"
                fullWidth
              />
            </Paper>
          </Box>
        </CatalogFilterLayout.Filters>
        <CatalogFilterLayout.Content>
          <Box className={tableWrapperClasses.tableWrapper}>
            <Table
              title={`CI Activity (${filteredRows.length})`}
              options={{
                search: true,
                paging: true,
                pageSize: 10,
                pageSizeOptions: [10, 20, 50],
              }}
              columns={columns}
              data={filteredRows}
            />
          </Box>
        </CatalogFilterLayout.Content>
      </CatalogFilterLayout>
    </div>
  );
};
