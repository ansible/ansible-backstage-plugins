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
import { useAsyncRetry } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import {
  Content,
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import {
  Grid,
  Button,
  Typography,
  CircularProgress,
  makeStyles,
  Paper,
  LinearProgress,
  Chip,
} from '@material-ui/core';
import RefreshIcon from '@material-ui/icons/Refresh';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import { apmeApiRef } from '../../api';
import { ApmeHealthCard } from '../ApmeHealthCard';
import { ApmeViolationsTable } from '../ApmeViolationsTable';

const useStyles = makeStyles(theme => ({
  scanButton: {
    marginLeft: theme.spacing(2),
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  noData: {
    padding: theme.spacing(4),
    textAlign: 'center',
  },
  scanStatus: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
    backgroundColor: theme.palette.background.default,
  },
  scanStatusHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
  },
  progressBar: {
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(1),
  },
  progressText: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusChip: {
    marginLeft: theme.spacing(1),
  },
  successIcon: {
    color: theme.palette.success.main,
  },
  errorIcon: {
    color: theme.palette.error.main,
  },
}));

interface ScanProgress {
  status: string;
  phase?: string;
  message?: string;
  progress?: number;
  violationsFound?: number;
  filesScanned?: number;
  totalFiles?: number;
}

export const ApmeEntityTab = () => {
  const classes = useStyles();
  const apmeApi = useApi(apmeApiRef);
  const { entity } = useEntity();
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<Error | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [_operationId, setOperationId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const repoUrl =
    entity.metadata.annotations?.['backstage.io/source-location'] ||
    entity.metadata.annotations?.['github.com/project-slug'];

  const {
    value: project,
    loading,
    error,
    retry,
  } = useAsyncRetry(async () => {
    if (!repoUrl) return null;
    return apmeApi.getProjectByRepoUrl(repoUrl);
  }, [repoUrl]);

  // Poll for scan completion (SSE would need backend proxy for CORS)
  useEffect(() => {
    if (!scanning || !project) return undefined;

    let pollCount = 0;
    const maxPolls = 60; // 2 minutes max
    const initialScanTime = project.last_scanned_at;

    const pollInterval = setInterval(async () => {
      pollCount++;

      // Update progress message
      setScanProgress(prev => ({
        ...prev,
        status: 'running',
        message: `Scanning repository... (${pollCount * 2}s)`,
        progress: Math.min(10 + pollCount * 1.5, 90),
      }));

      // Check if scan completed
      try {
        const updatedProject = await apmeApi.getProjectByRepoUrl(repoUrl!);

        if (updatedProject) {
          // Check if active_operation is null (scan finished) AND last_scanned_at changed
          const scanFinished =
            updatedProject.active_operation === null &&
            updatedProject.last_scanned_at !== initialScanTime;

          if (scanFinished) {
            clearInterval(pollInterval);
            setScanProgress({
              status: 'completed',
              message: 'Scan completed!',
              progress: 100,
              violationsFound: updatedProject.total_violations,
            });
            setTimeout(() => {
              retry();
              setRefreshKey(k => k + 1);
              setScanning(false);
              setOperationId(null);
              setScanProgress(null);
            }, 2000);
          }
        }
      } catch {
        // Ignore errors during polling
      }

      if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
        setScanProgress({
          status: 'timeout',
          message:
            'Scan is taking longer than expected. Check APME UI for status.',
          progress: 90,
        });
        setScanning(false);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [scanning, project, apmeApi, repoUrl, retry]);

  const handleScan = useCallback(async () => {
    if (!project) return;
    setScanning(true);
    setScanError(null);
    setScanProgress({
      status: 'starting',
      message: `Starting scan for ${project.name}...`,
      progress: 0,
    });

    try {
      const result = await apmeApi.triggerScan(project.id);
      setOperationId(result.scanId);
      setScanProgress({
        status: 'queued',
        message: 'Scan queued, connecting to progress stream...',
        progress: 5,
      });
    } catch (err) {
      setScanError(err as Error);
      setScanning(false);
      setScanProgress(null);
    }
  }, [project, apmeApi]);

  const getStatusColor = (
    status: string,
  ): 'default' | 'primary' | 'secondary' => {
    switch (status) {
      case 'completed':
        return 'primary';
      case 'failed':
        return 'secondary';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <Content>
        <Progress />
      </Content>
    );
  }

  if (error) {
    return (
      <Content>
        <ResponseErrorPanel error={error} />
      </Content>
    );
  }

  if (!project) {
    return (
      <Content>
        <InfoCard title="APME - Ansible Policy & Modernization">
          <div className={classes.noData}>
            <Typography variant="h6" gutterBottom>
              No APME scan data available
            </Typography>
            <Typography variant="body2" color="textSecondary">
              This repository has not been scanned by APME yet.
              {repoUrl && (
                <>
                  <br />
                  Repository: {repoUrl}
                </>
              )}
            </Typography>
          </div>
        </InfoCard>
      </Content>
    );
  }

  return (
    <Content>
      <div className={classes.header}>
        <Typography variant="h4">APME Analysis</Typography>
        <Button
          className={classes.scanButton}
          variant="contained"
          color="primary"
          startIcon={
            scanning ? <CircularProgress size={20} /> : <RefreshIcon />
          }
          onClick={handleScan}
          disabled={scanning}
        >
          {scanning ? 'Scanning...' : 'Scan Now'}
        </Button>
      </div>

      {/* Scan Progress Panel */}
      {(scanning || scanProgress) && (
        <Paper className={classes.scanStatus} elevation={1}>
          <div className={classes.scanStatusHeader}>
            {(() => {
              if (scanProgress?.status === 'completed') {
                return <CheckCircleIcon className={classes.successIcon} />;
              }
              if (scanProgress?.status === 'failed') {
                return <ErrorIcon className={classes.errorIcon} />;
              }
              return <CircularProgress size={20} />;
            })()}
            <Typography variant="subtitle1">
              <strong>Scanning:</strong> {project.name}
            </Typography>
            {scanProgress?.status && (
              <Chip
                size="small"
                label={scanProgress.status}
                color={getStatusColor(scanProgress.status)}
                className={classes.statusChip}
              />
            )}
          </div>

          {scanProgress?.progress !== undefined &&
            scanProgress.progress < 100 && (
              <LinearProgress
                variant="determinate"
                value={scanProgress.progress}
                className={classes.progressBar}
              />
            )}

          <div className={classes.progressText}>
            <Typography variant="body2" color="textSecondary">
              {scanProgress?.message || 'Initializing...'}
            </Typography>
            {scanProgress?.violationsFound !== undefined && (
              <Typography variant="body2">
                Violations found:{' '}
                <strong>{scanProgress.violationsFound}</strong>
              </Typography>
            )}
          </div>

          {scanProgress?.filesScanned !== undefined &&
            scanProgress?.totalFiles !== undefined && (
              <Typography variant="caption" color="textSecondary">
                Files: {scanProgress.filesScanned} / {scanProgress.totalFiles}
              </Typography>
            )}
        </Paper>
      )}

      {scanError && <ResponseErrorPanel error={scanError} />}

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <ApmeHealthCard key={`health-${refreshKey}`} />
        </Grid>
        <Grid item xs={12}>
          <InfoCard title="Violations">
            <ApmeViolationsTable key={`violations-${refreshKey}`} />
          </InfoCard>
        </Grid>
      </Grid>
    </Content>
  );
};
