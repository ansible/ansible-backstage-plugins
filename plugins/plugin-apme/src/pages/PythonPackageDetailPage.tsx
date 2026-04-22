import React from 'react';
import { useParams } from 'react-router-dom';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { Content, ContentHeader, Progress, WarningPanel, Table, TableColumn } from '@backstage/core-components';
import { Card, CardContent, Typography, Chip } from '@material-ui/core';
import { apmeApiRef } from '../api/ApmeApi';

export const PythonPackageDetailPage = () => {
  const { name } = useParams<{ name: string }>();
  const api = useApi(apmeApiRef);
  const { value: detail, loading, error } = useAsync(() => api.getPythonPackage(name!), [name]);

  if (loading) return <Progress />;
  if (error) return <WarningPanel title="Failed to load package">{error.message}</WarningPanel>;
  if (!detail) return <WarningPanel title="Package not found" />;

  const projectCols: TableColumn[] = [
    { title: 'Project', field: 'name' },
    { title: 'Health', field: 'health_score', type: 'numeric' },
    { title: 'Version', field: 'package_version' },
  ];

  return (
    <Content>
      <ContentHeader title={detail.name} />
      <Card><CardContent>
        <Typography>Projects: {detail.project_count}</Typography>
        <Typography>Versions: {detail.versions.map(v => <Chip key={v} label={v} size="small" style={{ marginRight: 4 }} />)}</Typography>
      </CardContent></Card>
      <Table title="Projects Using This Package" columns={projectCols} data={detail.projects} />
    </Content>
  );
};
