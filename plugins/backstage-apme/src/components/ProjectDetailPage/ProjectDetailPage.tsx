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

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
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
  Link,
  Breadcrumbs,
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
  LinearProgress,
  CircularProgress,
  Paper,
  IconButton,
  Tooltip,
} from '@material-ui/core';
import RefreshIcon from '@material-ui/icons/Refresh';
import BuildIcon from '@material-ui/icons/Build';
import GitHubIcon from '@material-ui/icons/GitHub';
import LinkIcon from '@material-ui/icons/Link';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import { Activity, Violation } from '@ansible/backstage-apme-common';
import { apmeApiRef } from '../../api';

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  actionButtons: {
    display: 'flex',
    gap: theme.spacing(1),
  },
  statsCard: {
    height: '100%',
  },
  statValue: {
    fontSize: '2rem',
    fontWeight: 'bold',
  },
  scanProgress: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
    backgroundColor: theme.palette.background.default,
  },
  highScore: {
    color: '#4caf50',
  },
  mediumScore: {
    color: '#ff9800',
  },
  lowScore: {
    color: '#f44336',
  },
  levelChip: {
    fontWeight: 'bold',
  },
  high: {
    backgroundColor: theme.palette.error.main,
    color: 'white',
  },
  medium: {
    backgroundColor: theme.palette.warning.main,
    color: 'white',
  },
  low: {
    backgroundColor: theme.palette.info.main,
    color: 'white',
  },
  check: {
    backgroundColor: '#2196f3',
    color: 'white',
  },
  remediate: {
    backgroundColor: '#4caf50',
    color: 'white',
  },
}));

export const ProjectDetailPage = () => {
  const classes = useStyles();
  const { projectId } = useParams<{ projectId: string }>();
  const apmeApi = useApi(apmeApiRef);
  const [scanning, setScanning] = useState(false);
  const [remediating, setRemediating] = useState(false);
  const [scanProgress, setScanProgress] = useState<string | null>(null);

  const {
    value: data,
    loading,
    error,
    retry,
  } = useAsyncRetry(async () => {
    const [project, violations, activity] = await Promise.all([
      apmeApi.getProject(projectId!),
      apmeApi.getViolations(projectId!),
      apmeApi.getActivity(projectId!),
    ]);
    return { project, violations, activity };
  }, [projectId]);

  // Poll for scan completion
  useEffect(() => {
    if (!scanning && !remediating) return;

    const pollInterval = setInterval(async () => {
      const project = await apmeApi.getProject(projectId!);
      if (!project.active_operation) {
        clearInterval(pollInterval);
        setScanning(false);
        setRemediating(false);
        setScanProgress(null);
        retry();
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [scanning, remediating, projectId, apmeApi, retry]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setScanProgress('Starting scan...');
    try {
      await apmeApi.triggerScan(projectId!);
      setScanProgress('Scan in progress...');
    } catch (err) {
      setScanning(false);
      setScanProgress(null);
    }
  }, [projectId, apmeApi]);

  const handleRemediate = useCallback(async () => {
    setRemediating(true);
    setScanProgress('Starting remediation...');
    try {
      await apmeApi.triggerRemediate(projectId!);
      setScanProgress('Remediation in progress...');
    } catch (err) {
      setRemediating(false);
      setScanProgress(null);
    }
  }, [projectId, apmeApi]);

  const handleCreatePR = useCallback(async (activityId: string) => {
    try {
      const result = await apmeApi.createPullRequest(projectId!, activityId);
      if (result.pr_url) {
        window.open(result.pr_url, '_blank');
      }
      retry();
    } catch (err) {
      // Handle error
    }
  }, [projectId, apmeApi, retry]);

  if (loading) {
    return (
      <Page themeId="tool">
        <Header title="Loading..." />
        <Content>
          <Progress />
        </Content>
      </Page>
    );
  }

  if (error || !data) {
    return (
      <Page themeId="tool">
        <Header title="Error" />
        <Content>
          <ResponseErrorPanel error={error || new Error('Project not found')} />
        </Content>
      </Page>
    );
  }

  const { project, violations, activity } = data;

  const getScoreClass = (score: number): string => {
    if (score >= 80) return classes.highScore;
    if (score >= 60) return classes.mediumScore;
    return classes.lowScore;
  };

  const violationColumns: TableColumn<Violation>[] = [
    {
      title: 'Level',
      field: 'level',
      width: '80px',
      render: row => (
        <Chip
          size="small"
          label={row.level}
          className={`${classes.levelChip} ${(classes as Record<string, string>)[row.level] || ''}`}
        />
      ),
    },
    { title: 'Rule', field: 'rule_id', width: '100px' },
    { title: 'Message', field: 'message' },
    { title: 'File', field: 'file', render: row => `${row.file}:${row.line}` },
    { title: 'Validator', field: 'validator_source', width: '100px' },
  ];

  const activityColumns: TableColumn<Activity>[] = [
    {
      title: 'Type',
      field: 'scan_type',
      width: '100px',
      render: row => (
        <Chip
          size="small"
          label={row.scan_type}
          className={(classes as Record<string, string>)[row.scan_type] || ''}
        />
      ),
    },
    {
      title: 'Date',
      field: 'created_at',
      render: row => new Date(row.created_at).toLocaleString(),
    },
    { title: 'Violations', field: 'total_violations', width: '100px' },
    { title: 'Fixable', field: 'fixable', width: '80px' },
    { title: 'Remediated', field: 'remediated_count', width: '100px' },
    {
      title: 'PR',
      field: 'pr_url',
      width: '100px',
      render: row =>
        row.pr_url ? (
          <Link to={row.pr_url} target="_blank">
            <LinkIcon fontSize="small" />
          </Link>
        ) : row.remediated_count > 0 ? (
          <Tooltip title="Create Pull Request">
            <IconButton
              size="small"
              onClick={() => handleCreatePR(row.scan_id)}
            >
              <GitHubIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <Page themeId="tool">
      <Header title={project.name} subtitle={project.repo_url}>
        <HeaderLabel label="Health" value={`${project.health_score}%`} />
        <HeaderLabel label="Violations" value={String(project.total_violations)} />
      </Header>
      <Content>
        <Breadcrumbs>
          <Link to="/apme">APME</Link>
          <Typography>{project.name}</Typography>
        </Breadcrumbs>

        <ContentHeader title="">
          <div className={classes.actionButtons}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={handleScan}
              disabled={scanning || remediating}
            >
              {scanning ? 'Scanning...' : 'Scan'}
            </Button>
            <Button
              variant="contained"
              color="primary"
              startIcon={<BuildIcon />}
              onClick={handleRemediate}
              disabled={scanning || remediating || project.total_violations === 0}
            >
              {remediating ? 'Remediating...' : 'Remediate'}
            </Button>
          </div>
        </ContentHeader>

        {scanProgress && (
          <Paper className={classes.scanProgress}>
            <Box display="flex" alignItems="center" gap={2}>
              <CircularProgress size={20} />
              <Typography>{scanProgress}</Typography>
            </Box>
            <LinearProgress style={{ marginTop: 8 }} />
          </Paper>
        )}

        {/* Stats */}
        <Grid container spacing={3} style={{ marginBottom: 24 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card className={classes.statsCard}>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Health Score
                </Typography>
                <Typography className={`${classes.statValue} ${getScoreClass(project.health_score)}`}>
                  {project.health_score}%
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card className={classes.statsCard}>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total Violations
                </Typography>
                <Typography className={classes.statValue}>
                  {project.total_violations}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card className={classes.statsCard}>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Scans
                </Typography>
                <Typography className={classes.statValue}>
                  {project.scan_count}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card className={classes.statsCard}>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Branch
                </Typography>
                <Typography variant="h6">{project.branch}</Typography>
                {project.last_scanned_at && (
                  <Typography variant="caption" color="textSecondary">
                    Last scan: {new Date(project.last_scanned_at).toLocaleDateString()}
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Violations Table */}
        <Box marginBottom={3}>
          <Table
            title={`Violations (${violations.length})`}
            options={{
              search: true,
              paging: true,
              pageSize: 10,
            }}
            columns={violationColumns}
            data={violations}
          />
        </Box>

        {/* Activity Table */}
        <Table
          title="Scan History"
          options={{
            search: false,
            paging: true,
            pageSize: 5,
          }}
          columns={activityColumns}
          data={activity}
        />
      </Content>
    </Page>
  );
};
