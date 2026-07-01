import { useCallback, useEffect, useState } from 'react';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import {
  ContentHeader,
  Progress,
  WarningPanel,
  Table,
  TableColumn,
} from '@backstage/core-components';
import { Link } from 'react-router-dom';
import { Box, Card, CardContent, Grid, Typography } from '@material-ui/core';
import { apmeApiRef } from '../api/ApmeApi';
import { timeAgo } from '../components/format';
import { healthColor } from '../components/severity';
import type {
  ActiveOperation,
  ProjectRanking,
  DashboardSummary,
} from '../types/api';

type DashboardData = {
  summary: DashboardSummary;
  cleanest: ProjectRanking[];
  mostViolations: ProjectRanking[];
  stale: ProjectRanking[];
  mostActive: ProjectRanking[];
};

const METRIC_VALUE_STYLE = { fontWeight: 600, fontSize: '1.75rem' } as const;

function SummaryMetric({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: React.ReactNode;
  valueColor?: string;
}) {
  return (
    <Card>
      <CardContent>
        <Typography color="textSecondary" variant="body2" gutterBottom>
          {label}
        </Typography>
        <Box
          style={
            valueColor
              ? { ...METRIC_VALUE_STYLE, color: valueColor }
              : METRIC_VALUE_STYLE
          }
        >
          {value}
        </Box>
      </CardContent>
    </Card>
  );
}

function projectLinkName(row: ProjectRanking) {
  return <Link to={`projects/${row.id}`}>{row.name}</Link>;
}

function healthCell(row: ProjectRanking) {
  return (
    <span style={{ color: healthColor(row.health_score) }}>
      {row.health_score !== null &&
      row.health_score !== undefined &&
      !Number.isNaN(Number(row.health_score))
        ? Number(row.health_score).toFixed(1)
        : '—'}
    </span>
  );
}

function lastScanLabel(row: ProjectRanking) {
  if (!row.last_scanned_at) {
    return '—';
  }
  return timeAgo(row.last_scanned_at);
}

export const DashboardPage = () => {
  const api = useApi(apmeApiRef);

  const { value, loading, error } = useAsync((): Promise<DashboardData> => {
    return Promise.all([
      api.getDashboardSummary(),
      api.getDashboardRankings('health_score', 'desc', 10),
      api.getDashboardRankings('health_score', 'asc', 10),
      api.getDashboardRankings('last_scanned_at', 'desc', 10),
      api.getDashboardRankings('scan_count', 'desc', 10),
    ]).then(([summary, cleanest, mostViolations, stale, mostActive]) => ({
      summary,
      cleanest,
      mostViolations,
      stale,
      mostActive,
    }));
  }, [api]);

  const [activeOps, setActiveOps] = useState<ActiveOperation[]>([]);
  const [opsLoading, setOpsLoading] = useState(true);
  const [opsError, setOpsError] = useState<string | null>(null);

  const fetchActiveOperations = useCallback(async () => {
    try {
      const ops = await api.getActiveOperations();
      setActiveOps(ops);
      setOpsError(null);
    } catch (e) {
      setOpsError(
        e instanceof Error ? e.message : 'Failed to load active operations',
      );
    } finally {
      setOpsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void fetchActiveOperations();
    const id = window.setInterval(() => {
      void fetchActiveOperations();
    }, 5000);
    return () => window.clearInterval(id);
  }, [fetchActiveOperations]);

  const cleanestColumns: TableColumn[] = [
    {
      title: 'Project',
      field: 'name',
      render: (row: any) => projectLinkName(row),
    },
    {
      title: 'Health',
      field: 'health_score',
      render: (row: any) => healthCell(row),
    },
    { title: 'Violations', field: 'total_violations', type: 'numeric' },
    { title: 'Scans', field: 'scan_count', type: 'numeric' },
    {
      title: 'Last scan',
      field: 'last_scanned_at',
      render: (row: any) => lastScanLabel(row),
    },
  ];

  const mostViolColumns: TableColumn[] = cleanestColumns;

  const staleColumns: TableColumn[] = [
    {
      title: 'Project',
      field: 'name',
      render: (row: any) => projectLinkName(row),
    },
    {
      title: 'Days since last scan',
      field: 'days_since_last_scan',
      render: (row: any) =>
        row.days_since_last_scan !== null &&
        row.days_since_last_scan !== undefined &&
        !Number.isNaN(row.days_since_last_scan)
          ? String(row.days_since_last_scan)
          : '—',
    },
    {
      title: 'Last scanned',
      field: 'last_scanned_at',
      render: (row: any) => lastScanLabel(row),
    },
    {
      title: 'Health',
      field: 'health_score',
      render: (row: any) => healthCell(row),
    },
  ];

  const mostActiveColumns: TableColumn[] = [
    {
      title: 'Project',
      field: 'name',
      render: (row: any) => projectLinkName(row),
    },
    { title: 'Scan count', field: 'scan_count', type: 'numeric' },
    {
      title: 'Health',
      field: 'health_score',
      render: (row: any) => healthCell(row),
    },
    { title: 'Violations', field: 'total_violations', type: 'numeric' },
  ];

  const activeOpsColumns: TableColumn[] = [
    {
      title: 'Project',
      field: 'project_name',
      render: (row: any) => (
        <Link to={`projects/${row.project_id}`}>{row.project_name}</Link>
      ),
    },
    { title: 'Type', field: 'scan_type' },
    { title: 'Status', field: 'status' },
    {
      title: 'Started',
      field: 'started_at',
      render: (row: any) => timeAgo(row.started_at),
    },
  ];

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <WarningPanel title="Failed to load dashboard">
        {error.message}
      </WarningPanel>
    );
  }

  if (!value) {
    return (
      <WarningPanel title="Dashboard unavailable">
        No data was returned.
      </WarningPanel>
    );
  }

  const s = value.summary;
  const avgHealth = s.avg_health_score;

  return (
    <>
      <ContentHeader title="Dashboard" />
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryMetric
            label="Projects"
            value={s.total_projects.toLocaleString()}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryMetric
            label="Avg Health"
            value={
              avgHealth !== null &&
              avgHealth !== undefined &&
              !Number.isNaN(avgHealth)
                ? avgHealth.toFixed(1)
                : '—'
            }
            valueColor={
              avgHealth !== null &&
              avgHealth !== undefined &&
              !Number.isNaN(avgHealth)
                ? healthColor(avgHealth)
                : undefined
            }
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryMetric
            label="Current Violations"
            value={s.current_violations.toLocaleString()}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryMetric
            label="Current Fixable"
            value={s.current_fixable.toLocaleString()}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryMetric
            label="Total Checks"
            value={s.total_scans.toLocaleString()}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryMetric
            label="AI Candidates"
            value={s.current_ai_candidates.toLocaleString()}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryMetric
            label="Total Violations"
            value={s.total_violations.toLocaleString()}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryMetric
            label="Total Remediated"
            value={s.total_fixed.toLocaleString()}
          />
        </Grid>
      </Grid>

      <Box mt={3}>
        {opsError && (
          <Box mb={2}>
            <WarningPanel title="Active operations (latest refresh failed)">
              {opsError}
            </WarningPanel>
          </Box>
        )}
        {opsLoading && <Progress />}
        {!opsLoading && (
          <Table
            title="Active operations (refreshes every 5 seconds)"
            columns={activeOpsColumns}
            data={activeOps}
            options={{ paging: false, search: false }}
            emptyContent="No active operations"
          />
        )}
      </Box>

      <Box mt={3}>
        <Table
          title="Top 10 Cleanest (by health score)"
          columns={cleanestColumns}
          data={value.cleanest}
          options={{ paging: false, search: false }}
          emptyContent="No projects to rank"
        />
      </Box>
      <Box mt={2}>
        <Table
          title="Top 10 Most Violations (lowest health score first)"
          columns={mostViolColumns}
          data={value.mostViolations}
          options={{ paging: false, search: false }}
          emptyContent="No projects to rank"
        />
      </Box>
      <Box mt={2}>
        <Table
          title="Stale projects (by last scan time)"
          columns={staleColumns}
          data={value.stale}
          options={{ paging: false, search: false }}
          emptyContent="No projects to rank"
        />
      </Box>
      <Box mt={2}>
        <Table
          title="Most active (by scan count)"
          columns={mostActiveColumns}
          data={value.mostActive}
          options={{ paging: false, search: false }}
          emptyContent="No projects to rank"
        />
      </Box>
    </>
  );
};
