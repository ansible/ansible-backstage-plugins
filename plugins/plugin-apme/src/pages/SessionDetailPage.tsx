import React from 'react';
import { useParams } from 'react-router-dom';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { Content, ContentHeader, Progress, WarningPanel, Table, TableColumn } from '@backstage/core-components';
import { Card, CardContent, Typography } from '@material-ui/core';
import { Link } from 'react-router-dom';
import { apmeApiRef } from '../api/ApmeApi';

export const SessionDetailPage = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const api = useApi(apmeApiRef);
  const { value: session, loading, error } = useAsync(() => api.getSession(sessionId!), [sessionId]);

  if (loading) return <Progress />;
  if (error) return <WarningPanel title="Failed to load session">{error.message}</WarningPanel>;
  if (!session) return <WarningPanel title="Session not found" />;

  const scanCols: TableColumn[] = [
    { title: 'Scan ID', field: 'scan_id', render: (row: any) => <Link to={`/apme/activity/${row.scan_id}`}>{row.scan_id.slice(0, 8)}</Link> },
    { title: 'Type', field: 'scan_type' },
    { title: 'Violations', field: 'total_violations', type: 'numeric' },
    { title: 'Created', field: 'created_at' },
  ];

  return (
    <Content>
      <ContentHeader title={`Session ${session.session_id.slice(0, 12)}`} />
      <Card><CardContent>
        <Typography>Project: {session.project_path}</Typography>
        <Typography>First Seen: {session.first_seen}</Typography>
        <Typography>Last Seen: {session.last_seen}</Typography>
      </CardContent></Card>
      <Table title="Scans" columns={scanCols} data={session.scans} />
    </Content>
  );
};
