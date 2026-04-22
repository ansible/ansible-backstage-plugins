import React from 'react';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { Content, ContentHeader, Progress, WarningPanel, Table, TableColumn } from '@backstage/core-components';
import { Link } from 'react-router-dom';
import { apmeApiRef } from '../api/ApmeApi';

export const SessionsPage = () => {
  const api = useApi(apmeApiRef);
  const { value, loading, error } = useAsync(() => api.listSessions(50, 0));

  if (loading) return <Progress />;
  if (error) return <WarningPanel title="Failed to load sessions">{error.message}</WarningPanel>;

  const columns: TableColumn[] = [
    { title: 'Session ID', field: 'session_id', render: (row: any) => <Link to={`sessions/${row.session_id}`}>{row.session_id.slice(0, 12)}</Link> },
    { title: 'Project', field: 'project_path' },
    { title: 'First Seen', field: 'first_seen' },
    { title: 'Last Seen', field: 'last_seen' },
  ];

  return (
    <Content>
      <ContentHeader title="Sessions" />
      <Table title="Engine Sessions" columns={columns} data={value?.items ?? []} />
    </Content>
  );
};
