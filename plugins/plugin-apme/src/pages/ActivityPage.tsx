import React from 'react';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { Content, ContentHeader, Progress, WarningPanel, Table, TableColumn } from '@backstage/core-components';
import { Link } from 'react-router-dom';
import { apmeApiRef } from '../api/ApmeApi';

export const ActivityPage = () => {
  const api = useApi(apmeApiRef);
  const { value, loading, error } = useAsync(() => api.listActivity(50, 0));

  if (loading) return <Progress />;
  if (error) return <WarningPanel title="Failed to load activity">{error.message}</WarningPanel>;

  const columns: TableColumn[] = [
    { title: 'Scan ID', field: 'scan_id', render: (row: any) => <Link to={`activity/${row.scan_id}`}>{row.scan_id.slice(0, 8)}</Link> },
    { title: 'Type', field: 'scan_type' },
    { title: 'Project', field: 'project_path' },
    { title: 'Violations', field: 'total_violations', type: 'numeric' },
    { title: 'Fixable', field: 'fixable', type: 'numeric' },
    { title: 'Remediated', field: 'remediated_count', type: 'numeric' },
    { title: 'Created', field: 'created_at' },
  ];

  return (
    <Content>
      <ContentHeader title="Activity" />
      <Table title="Scan History" columns={columns} data={value?.items ?? []} />
    </Content>
  );
};
