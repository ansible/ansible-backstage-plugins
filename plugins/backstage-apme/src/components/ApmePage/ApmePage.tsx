/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsyncRetry } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import {
  Content,
  ContentHeader,
  Header,
  HeaderLabel,
  Page,
  Progress,
  ResponseErrorPanel,
  Table,
  TableColumn,
  SupportButton,
  Link,
} from '@backstage/core-components';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  makeStyles,
  Box,
  Button,
} from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import WarningIcon from '@material-ui/icons/Warning';
import ErrorIcon from '@material-ui/icons/Error';
import StorageIcon from '@material-ui/icons/Storage';
import BugReportIcon from '@material-ui/icons/BugReport';
import TrendingUpIcon from '@material-ui/icons/TrendingUp';
import AddIcon from '@material-ui/icons/Add';
import { Project } from '@ansible/backstage-apme-common';
import { apmeApiRef } from '../../api';
import { CreateProjectDialog } from '../CreateProjectDialog';

const useStyles = makeStyles(theme => ({
  statsCard: {
    height: '100%',
  },
  statValue: {
    fontSize: '2.5rem',
    fontWeight: 'bold',
    color: theme.palette.primary.main,
  },
  statLabel: {
    color: theme.palette.text.secondary,
  },
  statIcon: {
    fontSize: '3rem',
    opacity: 0.3,
    position: 'absolute',
    right: theme.spacing(2),
    top: theme.spacing(2),
  },
  healthyIcon: {
    color: '#4caf50',
  },
  degradedIcon: {
    color: '#ff9800',
  },
  unhealthyIcon: {
    color: '#f44336',
  },
  scoreChip: {
    fontWeight: 'bold',
  },
  highScore: {
    backgroundColor: '#4caf50',
    color: 'white',
  },
  mediumScore: {
    backgroundColor: '#ff9800',
    color: 'white',
  },
  lowScore: {
    backgroundColor: '#f44336',
    color: 'white',
  },
  trendUp: {
    color: '#4caf50',
  },
  trendDown: {
    color: '#f44336',
  },
  trendStable: {
    color: theme.palette.text.secondary,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
  componentStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  componentOk: {
    color: '#4caf50',
  },
  componentError: {
    color: '#f44336',
  },
}));

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
}

const StatCard = ({ title, value, icon, subtitle }: StatCardProps) => {
  const classes = useStyles();
  return (
    <Card className={classes.statsCard}>
      <CardContent style={{ position: 'relative' }}>
        <Box className={classes.statIcon}>{icon}</Box>
        <Typography className={classes.statLabel} gutterBottom>
          {title}
        </Typography>
        <Typography className={classes.statValue}>{value}</Typography>
        {subtitle && (
          <Typography variant="caption" color="textSecondary">
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export const ApmePage = () => {
  const classes = useStyles();
  const navigate = useNavigate();
  const apmeApi = useApi(apmeApiRef);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const {
    value: data,
    loading,
    error,
    retry,
  } = useAsyncRetry(async () => {
    const [health, projects] = await Promise.all([
      apmeApi.getHealth(),
      apmeApi.getProjects(),
    ]);
    return { health, projects };
  }, []);

  if (loading) {
    return (
      <Page themeId="tool">
        <Header title="APME" subtitle="Ansible Policy & Modernization Engine">
          <HeaderLabel label="Status" value="Loading..." />
        </Header>
        <Content>
          <Progress />
        </Content>
      </Page>
    );
  }

  if (error) {
    return (
      <Page themeId="tool">
        <Header title="APME" subtitle="Ansible Policy & Modernization Engine">
          <HeaderLabel label="Status" value="Error" />
        </Header>
        <Content>
          <ResponseErrorPanel error={error} />
        </Content>
      </Page>
    );
  }

  const { health, projects } = data || { health: null, projects: [] };

  const totalViolations = projects.reduce((sum, p) => sum + (p.total_violations || 0), 0);
  const totalScans = projects.reduce((sum, p) => sum + (p.scan_count || 0), 0);
  const avgScore = projects.length > 0
    ? Math.round(projects.reduce((sum, p) => sum + (p.health_score || 0), 0) / projects.length)
    : 0;

  const getScoreClass = (score: number): string => {
    if (score >= 80) return classes.highScore;
    if (score >= 60) return classes.mediumScore;
    return classes.lowScore;
  };

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'ok':
      case 'healthy':
        return <CheckCircleIcon className={classes.healthyIcon} />;
      case 'degraded':
        return <WarningIcon className={classes.degradedIcon} />;
      default:
        return <ErrorIcon className={classes.unhealthyIcon} />;
    }
  };

  const getTrendIcon = (trend?: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUpIcon className={classes.trendUp} />;
      case 'declining':
        return <TrendingUpIcon className={classes.trendDown} style={{ transform: 'rotate(180deg)' }} />;
      default:
        return <span className={classes.trendStable}>―</span>;
    }
  };

  const handleRowClick = (project: Project) => {
    navigate(`/apme/project/${project.id}`);
  };

  const columns: TableColumn<Project>[] = [
    {
      title: 'Project',
      field: 'name',
      render: row => (
        <Link to={`/apme/project/${row.id}`}>
          {row.name}
        </Link>
      ),
    },
    {
      title: 'Health Score',
      field: 'health_score',
      width: '120px',
      render: row => (
        <Chip
          size="small"
          label={`${row.health_score}%`}
          className={`${classes.scoreChip} ${getScoreClass(row.health_score)}`}
        />
      ),
    },
    {
      title: 'Violations',
      field: 'total_violations',
      width: '100px',
      type: 'numeric',
    },
    {
      title: 'Trend',
      field: 'violation_trend',
      width: '80px',
      render: row => getTrendIcon(row.violation_trend),
    },
    {
      title: 'Scans',
      field: 'scan_count',
      width: '80px',
      type: 'numeric',
    },
    {
      title: 'Last Scan',
      field: 'last_scanned_at',
      render: row =>
        row.last_scanned_at
          ? new Date(row.last_scanned_at).toLocaleString()
          : 'Never',
    },
    {
      title: 'Branch',
      field: 'branch',
      width: '100px',
    },
  ];

  return (
    <Page themeId="tool">
      <Header title="APME" subtitle="Ansible Policy & Modernization Engine">
        <HeaderLabel label="Status" value={health?.status || 'Unknown'} />
        <HeaderLabel label="Projects" value={String(projects.length)} />
      </Header>
      <Content>
        <ContentHeader title="Overview">
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Add Project
          </Button>
          <SupportButton>
            APME analyzes Ansible content for policy compliance, security issues,
            and modernization opportunities.
          </SupportButton>
        </ContentHeader>

        <CreateProjectDialog
          open={createDialogOpen}
          onClose={() => setCreateDialogOpen(false)}
          onCreated={retry}
        />

        {/* Stats Cards */}
        <Grid container spacing={3} style={{ marginBottom: 24 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Projects"
              value={projects.length}
              icon={<StorageIcon />}
              subtitle="Repositories tracked"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Total Violations"
              value={totalViolations.toLocaleString()}
              icon={<BugReportIcon />}
              subtitle="Across all projects"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Total Scans"
              value={totalScans.toLocaleString()}
              icon={<TrendingUpIcon />}
              subtitle="Analysis runs completed"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Avg Health Score"
              value={`${avgScore}%`}
              icon={<CheckCircleIcon />}
              subtitle="Across all projects"
            />
          </Grid>
        </Grid>

        {/* Service Health */}
        {health && (
          <Card style={{ marginBottom: 24 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Service Health
              </Typography>
              <Grid container spacing={2}>
                {health.components?.map((component) => (
                  <Grid item xs={12} sm={6} md={4} key={component.name}>
                    <Box className={classes.componentStatus}>
                      {getHealthIcon(component.status)}
                      <Typography variant="body2">
                        {component.name}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        ({component.address})
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        )}

        {/* Projects Table */}
        <Table
          title="Projects"
          options={{
            search: true,
            paging: true,
            pageSize: 10,
            pageSizeOptions: [10, 25, 50],
            sorting: true,
          }}
          columns={columns}
          data={projects}
          onRowClick={(_, rowData) => rowData && handleRowClick(rowData)}
        />
      </Content>
    </Page>
  );
};
