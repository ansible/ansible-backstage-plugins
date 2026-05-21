import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import {
  ContentHeader,
  Progress,
  WarningPanel,
  Table,
  TableColumn,
} from '@backstage/core-components';
import { Box, Card, CardContent, Chip, Typography } from '@material-ui/core';
import { apmeApiRef } from '../api/ApmeApi';
import type { CollectionProjectRef } from '../types/api';
import { healthColor } from '../components/severity';

export const CollectionDetailPage = () => {
  const { fqcn: fqcnParam } = useParams<{ fqcn: string }>();
  const fqcn = fqcnParam ? decodeURIComponent(fqcnParam) : '';
  const api = useApi(apmeApiRef);
  const {
    value: detail,
    loading,
    error,
  } = useAsync(() => api.getCollection(fqcn), [fqcn]);

  if (loading) return <Progress />;
  if (error)
    return (
      <WarningPanel title="Failed to load collection">
        {error.message}
      </WarningPanel>
    );
  if (!detail) return <WarningPanel title="Collection not found" />;

  const projectCols: TableColumn<CollectionProjectRef>[] = [
    {
      title: 'Name',
      field: 'name',
      customSort: (a, b) => a.name.localeCompare(b.name),
      render: row => <Link to={`../../projects/${row.id}`}>{row.name}</Link>,
    },
    {
      title: 'Health Score',
      field: 'health_score',
      type: 'numeric',
      customSort: (a, b) => a.health_score - b.health_score,
      render: row => (
        <Typography
          component="span"
          style={{ color: healthColor(row.health_score), fontWeight: 600 }}
        >
          {row.health_score}
        </Typography>
      ),
    },
    {
      title: 'Collection Version',
      field: 'collection_version',
      customSort: (a, b) =>
        a.collection_version.localeCompare(b.collection_version),
    },
    {
      title: 'Last Scan',
      field: 'last_scan_id',
      customSort: (a, b) => a.last_scan_id.localeCompare(b.last_scan_id),
      render: row => (
        <Link to={`../../activity/${row.last_scan_id}`}>
          {row.last_scan_id}
        </Link>
      ),
    },
  ];

  return (
    <>
      <ContentHeader title={detail.fqcn} />
      <Card style={{ marginBottom: 16 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Collection
          </Typography>
          <Box mb={1}>
            <Typography variant="body2" color="textSecondary" component="span">
              FQCN:{' '}
            </Typography>
            <Typography variant="body1" component="span">
              {detail.fqcn}
            </Typography>
          </Box>
          <Box mb={1}>
            <Typography variant="body2" color="textSecondary" component="span">
              Source:{' '}
            </Typography>
            <Typography variant="body1" component="span">
              {detail.source}
            </Typography>
          </Box>
          <Box mb={1}>
            <Typography variant="body2" color="textSecondary" component="span">
              Project count:{' '}
            </Typography>
            <Typography variant="body1" component="span">
              {detail.project_count}
            </Typography>
          </Box>
          <Box
            display="flex"
            flexWrap="wrap"
            alignItems="center"
            style={{ gap: 8 }}
          >
            <Typography variant="body2" color="textSecondary">
              Versions:{' '}
            </Typography>
            {detail.versions.map(v => (
              <Chip key={v} label={v} size="small" />
            ))}
          </Box>
        </CardContent>
      </Card>
      <Table
        title="Projects using this collection"
        columns={projectCols as any}
        data={detail.projects}
        options={{ sorting: true, paging: true, pageSize: 20, search: false }}
      />
    </>
  );
};
