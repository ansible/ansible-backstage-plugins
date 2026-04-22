import React from 'react';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { Content, ContentHeader, Progress, WarningPanel, Table, TableColumn } from '@backstage/core-components';
import { Link } from 'react-router-dom';
import { apmeApiRef } from '../api/ApmeApi';

export const CollectionsPage = () => {
  const api = useApi(apmeApiRef);
  const { value: collections, loading, error } = useAsync(() => api.listCollections());

  if (loading) return <Progress />;
  if (error) return <WarningPanel title="Failed to load collections">{error.message}</WarningPanel>;

  const columns: TableColumn[] = [
    { title: 'FQCN', field: 'fqcn', render: (row: any) => <Link to={`collections/${row.fqcn}`}>{row.fqcn}</Link> },
    { title: 'Version', field: 'version' },
    { title: 'Source', field: 'source' },
    { title: 'Projects', field: 'project_count', type: 'numeric' },
  ];

  return (
    <Content>
      <ContentHeader title="Collections" />
      <Table title="Ansible Collections" columns={columns} data={collections ?? []} />
    </Content>
  );
};
