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
import type { PythonPackageProjectRef } from '../types/api';
import {
  healthColor,
  severityColor,
  SEVERITY_COLORS,
} from '../components/severity';

const SEVERITY_KEYS = [
  'critical',
  'error',
  'high',
  'medium',
  'low',
  'info',
] as const;

export const PythonPackageDetailPage = () => {
  const { name: nameParam } = useParams<{ name: string }>();
  const name = nameParam ? decodeURIComponent(nameParam) : '';
  const api = useApi(apmeApiRef);
  const {
    value: detail,
    loading,
    error,
  } = useAsync(() => api.getPythonPackage(name), [name]);

  if (loading) return <Progress />;
  if (error)
    return (
      <WarningPanel title="Failed to load package">
        {error.message}
      </WarningPanel>
    );
  if (!detail) return <WarningPanel title="Package not found" />;

  const projectCols: TableColumn<PythonPackageProjectRef>[] = [
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
      title: 'Package Version',
      field: 'package_version',
      customSort: (a, b) => a.package_version.localeCompare(b.package_version),
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
      <ContentHeader title={detail.name} />
      <Card style={{ marginBottom: 16 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Package
          </Typography>
          <Box mb={1}>
            <Typography variant="body2" color="textSecondary" component="span">
              Name:{' '}
            </Typography>
            <Typography variant="body1" component="span">
              {detail.name}
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
          <Box mt={2}>
            <Typography
              variant="caption"
              color="textSecondary"
              display="block"
              gutterBottom
            >
              Rule / CVE{' '}
              <span style={{ color: severityColor('high') }}>severity</span>{' '}
              uses the same palette as dependency health and project views.
            </Typography>
            <Box
              display="flex"
              flexWrap="wrap"
              style={{ gap: 4 }}
              alignItems="center"
            >
              {SEVERITY_KEYS.map(k => (
                <Chip
                  key={k}
                  size="small"
                  label={k}
                  style={{
                    backgroundColor: SEVERITY_COLORS[k],
                    color: '#fff',
                    height: 22,
                    fontSize: 10,
                  }}
                />
              ))}
            </Box>
          </Box>
        </CardContent>
      </Card>
      <Table
        title="Projects using this package"
        columns={projectCols as any}
        data={detail.projects}
        options={{ sorting: true, paging: true, pageSize: 20, search: false }}
      />
    </>
  );
};
