import { useEffect, useMemo, useState } from 'react';
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
import { formatTimeAgo } from '../CollectionsCatalog/utils';
import { CIActivityRow, STATUS_LABELS } from './ciActivityUtils';
import { ciActivityCache, CIActivityCacheState } from './ciActivityCache';

export type { CIActivityRow };

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

  const [cacheState, setCacheState] = useState<CIActivityCacheState | null>(
    ciActivityCache.getState(),
  );
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [triggerFilter, setTriggerFilter] = useState<string>('All');

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = ciActivityCache.subscribe(setCacheState);

    if (filterByEntity) {
      ciActivityCache.startLoading([filterByEntity], discoveryApi, fetchApi);
    } else if (cachedEntities && cachedEntities.length > 0) {
      ciActivityCache.startLoading(cachedEntities, discoveryApi, fetchApi);
    } else {
      catalogApi
        .getEntities({
          filter: [{ kind: 'Component', 'spec.type': 'git-repository' }],
        })
        .then(response => {
          if (cancelled) return;
          const items = Array.isArray(response)
            ? response
            : (response?.items ?? []);
          ciActivityCache.startLoading(items, discoveryApi, fetchApi);
        })
        .catch(e => {
          if (cancelled) return;
          ciActivityCache.setError(
            e instanceof Error ? e.message : 'Failed to load entities',
          );
        });
    }

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [discoveryApi, fetchApi, catalogApi, filterByEntity, cachedEntities]);

  const rows = useMemo(() => cacheState?.rows ?? [], [cacheState?.rows]);
  const loading = !cacheState;
  const fetchingMore = cacheState?.fetchingMore ?? false;
  const error = cacheState?.error ?? null;

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
