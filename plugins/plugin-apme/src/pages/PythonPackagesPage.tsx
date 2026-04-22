import React from 'react';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { Content, ContentHeader, Progress, WarningPanel, Table, TableColumn } from '@backstage/core-components';
import { Link } from 'react-router-dom';
import { apmeApiRef } from '../api/ApmeApi';

export const PythonPackagesPage = () => {
  const api = useApi(apmeApiRef);
  const { value: packages, loading, error } = useAsync(() => api.listPythonPackages());

  if (loading) return <Progress />;
  if (error) return <WarningPanel title="Failed to load packages">{error.message}</WarningPanel>;

  const columns: TableColumn[] = [
    { title: 'Name', field: 'name', render: (row: any) => <Link to={`python-packages/${row.name}`}>{row.name}</Link> },
    { title: 'Version', field: 'version' },
    { title: 'Projects', field: 'project_count', type: 'numeric' },
  ];

  return (
    <Content>
      <ContentHeader title="Python Packages" />
      <Table title="Python Dependencies" columns={columns} data={packages ?? []} />
    </Content>
  );
};
