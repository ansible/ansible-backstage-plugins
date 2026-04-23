import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import {
  ContentHeader,
  Progress,
  WarningPanel,
  Table,
  TableColumn,
} from '@backstage/core-components';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Link as MuiLink,
  Typography,
  Button,
} from '@material-ui/core';
import { apmeApiRef } from '../api/ApmeApi';
import { TrendChart } from '../components/TrendChart';
import { timeAgo } from '../components/format';
import type { ActivitySummary, SessionDetail, TrendPoint } from '../types/api';

export const SessionDetailPage = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const api = useApi(apmeApiRef);
  const { value, loading, error } = useAsync(async (): Promise<{
    session: SessionDetail;
    trend: TrendPoint[];
  } | null> => {
    if (!sessionId) return null;
    const [session, trend] = await Promise.all([
      api.getSession(sessionId),
      api.getSessionTrend(sessionId).catch(() => [] as TrendPoint[]),
    ]);
    return { session, trend };
  }, [sessionId]);

  if (loading) return <Progress />;
  if (!sessionId) {
    return (
      <WarningPanel title="Session">Missing session id in URL.</WarningPanel>
    );
  }
  if (error) {
    return (
      <WarningPanel title="Failed to load session">
        {error.message}
        <Box mt={1}>
          <Button color="primary" component={Link as React.ElementType} to="..">
            Back to sessions
          </Button>
        </Box>
      </WarningPanel>
    );
  }
  if (!value?.session) {
    return (
      <WarningPanel title="Session not found">
        <Button color="primary" component={Link as React.ElementType} to="..">
          Back to sessions
        </Button>
      </WarningPanel>
    );
  }

  const { session, trend } = value;
  const scanCount = session.scans?.length ?? 0;

  const scanCols: TableColumn<ActivitySummary>[] = [
    {
      title: 'Scan ID',
      field: 'scan_id',
      render: (row: ActivitySummary) => (
        <MuiLink
          component={Link}
          to={`../../activity/${row.scan_id}`}
          variant="body2"
        >
          {row.scan_id.length > 8 ? `${row.scan_id.slice(0, 8)}…` : row.scan_id}
        </MuiLink>
      ),
    },
    { title: 'Type', field: 'scan_type' },
    { title: 'Violations', field: 'total_violations', type: 'numeric' },
    {
      title: 'Created',
      field: 'created_at',
      render: (row: ActivitySummary) => timeAgo(row.created_at),
    },
  ];

  return (
    <>
      <ContentHeader
        title={session.project_path}
        description={`Session ${session.session_id.slice(0, 12)}${session.session_id.length > 12 ? '…' : ''}`}
      />

      <Box mb={2}>
        <Button
          size="small"
          color="primary"
          component={Link as React.ElementType}
          to=".."
        >
          ← Sessions
        </Button>
      </Box>

      <Grid container spacing={2} style={{ marginBottom: 16 }}>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box textAlign="center">
                <Typography variant="h4" style={{ fontWeight: 700 }}>
                  {scanCount}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Scans
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box textAlign="center">
                <Typography variant="h6" style={{ fontWeight: 600 }}>
                  {timeAgo(session.first_seen)}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  First seen
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box textAlign="center">
                <Typography variant="h6" style={{ fontWeight: 600 }}>
                  {timeAgo(session.last_seen)}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Last seen
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {trend && trend.length > 1 && (
        <Box mb={2}>
          <TrendChart data={trend} />
        </Box>
      )}

      <Typography variant="h6" gutterBottom>
        Activity ({scanCount})
      </Typography>
      {scanCount === 0 ? (
        <Box p={2} color="textSecondary">
          No scans in this session yet.
        </Box>
      ) : (
        <Table
          title="Session activity"
          options={{ search: false, paging: false }}
          columns={scanCols}
          data={session.scans}
        />
      )}
    </>
  );
};
