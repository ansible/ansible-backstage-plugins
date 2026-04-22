import React from 'react';
import { useParams } from 'react-router-dom';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { Content, ContentHeader, Progress, WarningPanel, Table, TableColumn } from '@backstage/core-components';
import { Grid, Card, CardContent, Typography } from '@material-ui/core';
import { apmeApiRef } from '../api/ApmeApi';

export const ActivityDetailPage = () => {
  const { activityId } = useParams<{ activityId: string }>();
  const api = useApi(apmeApiRef);
  const { value: activity, loading, error } = useAsync(() => api.getActivity(activityId!), [activityId]);

  if (loading) return <Progress />;
  if (error) return <WarningPanel title="Failed to load activity">{error.message}</WarningPanel>;
  if (!activity) return <WarningPanel title="Activity not found" />;

  const violationCols: TableColumn[] = [
    { title: 'Rule', field: 'rule_id' },
    { title: 'Level', field: 'level' },
    { title: 'File', field: 'file' },
    { title: 'Line', field: 'line', type: 'numeric' },
    { title: 'Message', field: 'message' },
  ];

  return (
    <Content>
      <ContentHeader title={`Scan ${activity.scan_id.slice(0, 8)}`} />
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card><CardContent>
            <Typography>Type: {activity.scan_type}</Typography>
            <Typography>Project: {activity.project_path}</Typography>
            <Typography>Violations: {activity.total_violations} | Fixable: {activity.fixable} | Remediated: {activity.remediated_count}</Typography>
            <Typography>Created: {activity.created_at}</Typography>
            {activity.pr_url && <Typography>PR: <a href={activity.pr_url} target="_blank" rel="noopener noreferrer">{activity.pr_url}</a></Typography>}
          </CardContent></Card>
        </Grid>
      </Grid>
      <Table title="Violations" columns={violationCols} data={activity.violations} />
    </Content>
  );
};
