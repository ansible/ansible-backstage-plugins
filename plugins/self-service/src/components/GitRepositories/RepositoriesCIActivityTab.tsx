import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Link, Paper, Typography } from '@material-ui/core';
import { useTheme } from '@material-ui/core/styles';
import Autocomplete from '@material-ui/lab/Autocomplete';
import TextField from '@material-ui/core/TextField';
import CircularProgress from '@material-ui/core/CircularProgress';
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
import { getProjectDisplayName } from './scmUtils';
import { BatchItem, buildBatchItems } from './ciBatchUtils';
import { CI_BATCH_CHUNK_SIZE, CI_PARALLEL_LIMIT } from './constants';

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

function normalizeGitHubStatus(raw: string): CIActivityRow['status'] {
  const valid: CIActivityRow['status'][] = [
    'success',
    'failure',
    'cancelled',
    'in_progress',
    'queued',
    'skipped',
  ];
  const s = raw.toLowerCase();
  return valid.includes(s as CIActivityRow['status'])
    ? (s as CIActivityRow['status'])
    : 'unknown';
}

function parseGitHubRuns(
  key: string,
  data: unknown,
  entity: Entity,
): CIActivityRow[] {
  const ghData = data as Record<string, unknown> | undefined;
  const runs = (
    Array.isArray(ghData?.workflow_runs) ? ghData.workflow_runs : []
  ) as Record<string, unknown>[];
  const repoUrl = getSourceUrl(entity);
  const baseUrl = (repoUrl ?? '').replace(/\.git$/i, '');
  const projectUrl = baseUrl ? `${baseUrl}/actions` : undefined;
  const projectName = getProjectDisplayName(entity);

  return runs.map((r: Record<string, unknown>) => {
    const run = r as Record<string, string | number | undefined>;
    return {
      id: `gh-${key}-${run.id}`,
      status: normalizeGitHubStatus(
        String(run.conclusion ?? run.status ?? 'unknown'),
      ),
      project: projectName,
      projectUrl,
      event: String(run.name ?? 'Workflow'),
      eventDisplay: `${run.name ?? 'Workflow'} #${run.run_number ?? run.id}`,
      trigger: String(run.event ?? 'unknown').replaceAll('_', ' '),
      time: String(run.created_at ?? ''),
      runUrl: run.html_url ? String(run.html_url) : undefined,
    };
  });
}

function parseGitLabPipelines(
  key: string,
  data: unknown,
  entity: Entity,
): CIActivityRow[] {
  const pipelines = (Array.isArray(data) ? data : []) as Record<
    string,
    unknown
  >[];
  const repoUrl = getSourceUrl(entity);
  const baseUrl = (repoUrl ?? '').replace(/\.git$/i, '');
  const projectUrl = baseUrl ? `${baseUrl}/-/pipelines` : undefined;
  const projectName = getProjectDisplayName(entity);

  return pipelines.map((p: Record<string, unknown>) => {
    const pipeline = p as Record<string, string | number | undefined>;
    return {
      id: `gl-${key}-${pipeline.id}`,
      status: normalizeGitLabStatus(
        pipeline.status !== null && pipeline.status !== undefined
          ? String(pipeline.status)
          : undefined,
      ),
      project: projectName,
      projectUrl,
      event: 'Pipeline',
      eventDisplay: `Pipeline #${pipeline.id}`,
      trigger: String(pipeline.source ?? 'unknown').replaceAll('_', ' '),
      time: String(pipeline.created_at ?? ''),
      runUrl: pipeline.web_url ? String(pipeline.web_url) : undefined,
    };
  });
}

function buildRowsFromResults(
  results: Record<
    string,
    { status: number; data: unknown } | { error: string }
  >,
  entityMap: Map<string, { entity: Entity; provider: string }>,
): CIActivityRow[] {
  const allRows: CIActivityRow[] = [];

  for (const [key, result] of Object.entries(results)) {
    if ('error' in result) continue;
    const entry = entityMap.get(key);
    if (!entry) continue;

    if (entry.provider === 'github') {
      allRows.push(...parseGitHubRuns(key, result.data, entry.entity));
    } else if (entry.provider === 'gitlab') {
      allRows.push(...parseGitLabPipelines(key, result.data, entry.entity));
    }
  }

  allRows.sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
  );
  return allRows.slice(0, 150);
}

export interface RepositoriesCIActivityTabProps {
  filterByEntity?: Entity | null;
  cachedEntities?: Entity[];
}

export const RepositoriesCIActivityTab = ({
  filterByEntity,
  cachedEntities,
}: RepositoriesCIActivityTabProps = {}) => {
  const theme = useTheme();
  const classes = useCollectionsStyles();
  const tableWrapperClasses = useTableWrapperStyles();
  const catalogApi = useApi(catalogApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const [loading, setLoading] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [rows, setRows] = useState<CIActivityRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [triggerFilter, setTriggerFilter] = useState<string>('All');

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    setFetchingMore(false);
    setError(null);
    setRows([]);

    try {
      let entities: Entity[];
      if (filterByEntity) {
        entities = [filterByEntity];
      } else if (cachedEntities && cachedEntities.length > 0) {
        entities = cachedEntities;
      } else {
        const response = await catalogApi.getEntities({
          filter: [{ kind: 'Component', 'spec.type': 'git-repository' }],
        });
        entities = Array.isArray(response) ? response : (response?.items ?? []);
      }

      const { items: batchItems, entityMap } = buildBatchItems(entities, 15);

      if (batchItems.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const catalogBase = await discoveryApi.getBaseUrl('catalog');
      const batchUrl = `${catalogBase}/ansible/git/ci-activity`;
      const allResults: Record<
        string,
        { status: number; data: unknown } | { error: string }
      > = {};

      const chunks: BatchItem[][] = [];
      for (let i = 0; i < batchItems.length; i += CI_BATCH_CHUNK_SIZE) {
        chunks.push(batchItems.slice(i, i + CI_BATCH_CHUNK_SIZE));
      }

      const fetchChunk = async (chunk: BatchItem[]) => {
        const res = await fetchApi.fetch(batchUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ items: chunk }),
        });

        if (!res.ok) {
          throw new Error(`Batch CI activity request failed: ${res.status}`);
        }

        return res.json();
      };

      setLoading(false);
      setFetchingMore(true);

      for (let i = 0; i < chunks.length; i += CI_PARALLEL_LIMIT) {
        const batch = chunks.slice(i, i + CI_PARALLEL_LIMIT);
        const results = await Promise.all(batch.map(fetchChunk));
        results.forEach(body => Object.assign(allResults, body.results));
        setRows(buildRowsFromResults(allResults, entityMap));
      }
      setFetchingMore(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load CI activity');
    } finally {
      setLoading(false);
      setFetchingMore(false);
    }
  }, [catalogApi, discoveryApi, fetchApi, filterByEntity, cachedEntities]);

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

  if (rows.length === 0 && !fetchingMore) {
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
              title={
                <>
                  {`CI Activity (${filteredRows.length})`}
                  {fetchingMore && (
                    <CircularProgress
                      size={16}
                      style={{ marginLeft: 8, verticalAlign: 'middle' }}
                    />
                  )}
                </>
              }
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
