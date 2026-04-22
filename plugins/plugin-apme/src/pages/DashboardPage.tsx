import React from 'react';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { Content, ContentHeader, Progress, WarningPanel } from '@backstage/core-components';
import { Grid, Card, CardContent, Typography } from '@material-ui/core';
import { apmeApiRef } from '../api/ApmeApi';

export const DashboardPage = () => {
  const api = useApi(apmeApiRef);
  const { value: summary, loading, error } = useAsync(() => api.getDashboardSummary());
  const { value: rankings } = useAsync(() => api.getDashboardRankings());

  if (loading) return <Progress />;
  if (error) return <WarningPanel title="Failed to load dashboard">{error.message}</WarningPanel>;

  return (
    <Content>
      <ContentHeader title="Dashboard" />
      <Grid container spacing={3}>
        <Grid item xs={3}><Card><CardContent><Typography variant="h4">{summary?.total_projects ?? 0}</Typography><Typography color="textSecondary">Projects</Typography></CardContent></Card></Grid>
        <Grid item xs={3}><Card><CardContent><Typography variant="h4">{summary?.total_scans ?? 0}</Typography><Typography color="textSecondary">Total Scans</Typography></CardContent></Card></Grid>
        <Grid item xs={3}><Card><CardContent><Typography variant="h4">{summary?.current_violations ?? 0}</Typography><Typography color="textSecondary">Current Violations</Typography></CardContent></Card></Grid>
        <Grid item xs={3}><Card><CardContent><Typography variant="h4">{summary?.total_fixed ?? 0}</Typography><Typography color="textSecondary">Total Fixed</Typography></CardContent></Card></Grid>
        <Grid item xs={3}><Card><CardContent><Typography variant="h4">{summary?.current_fixable ?? 0}</Typography><Typography color="textSecondary">Fixable</Typography></CardContent></Card></Grid>
        <Grid item xs={3}><Card><CardContent><Typography variant="h4">{summary?.current_ai_candidates ?? 0}</Typography><Typography color="textSecondary">AI Candidates</Typography></CardContent></Card></Grid>
        <Grid item xs={3}><Card><CardContent><Typography variant="h4">{summary?.avg_health_score?.toFixed(1) ?? '-'}</Typography><Typography color="textSecondary">Avg Health Score</Typography></CardContent></Card></Grid>
      </Grid>
      {rankings && rankings.length > 0 && (
        <>
          <ContentHeader title="Project Rankings" />
          <Grid container spacing={2}>
            {rankings.map(p => (
              <Grid item xs={12} key={p.id}>
                <Card><CardContent>
                  <Typography variant="h6">{p.name}</Typography>
                  <Typography color="textSecondary">Health: {p.health_score} | Violations: {p.total_violations} | Scans: {p.scan_count}</Typography>
                </CardContent></Card>
              </Grid>
            ))}
          </Grid>
        </>
      )}
    </Content>
  );
};
