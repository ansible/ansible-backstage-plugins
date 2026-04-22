import React from 'react';
import { useParams } from 'react-router-dom';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { Content, ContentHeader, Progress, WarningPanel, Table, TableColumn } from '@backstage/core-components';
import { Card, CardContent, Typography, Chip } from '@material-ui/core';
import { apmeApiRef } from '../api/ApmeApi';

export const CollectionDetailPage = () => {
  const { fqcn } = useParams<{ fqcn: string }>();
  const api = useApi(apmeApiRef);
  const { value: detail, loading, error } = useAsync(() => api.getCollection(fqcn!), [fqcn]);

  if (loading) return <Progress />;
  if (error) return <WarningPanel title="Failed to load collection">{error.message}</WarningPanel>;
  if (!detail) return <WarningPanel title="Collection not found" />;

  const projectCols: TableColumn[] = [
    { title: 'Project', field: 'name' },
    { title: 'Health', field: 'health_score', type: 'numeric' },
    { title: 'Version', field: 'collection_version' },
  ];

  return (
    <Content>
      <ContentHeader title={detail.fqcn} />
      <Card><CardContent>
        <Typography>Source: {detail.source}</Typography>
        <Typography>Projects: {detail.project_count}</Typography>
        <Typography>Versions: {detail.versions.map(v => <Chip key={v} label={v} size="small" style={{ marginRight: 4 }} />)}</Typography>
      </CardContent></Card>
      <Table title="Projects Using This Collection" columns={projectCols} data={detail.projects} />
    </Content>
  );
};
