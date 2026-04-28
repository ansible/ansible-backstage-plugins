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

import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import {
  Box,
  Typography,
  Chip,
  LinearProgress,
  makeStyles,
} from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import WarningIcon from '@material-ui/icons/Warning';
import ErrorIcon from '@material-ui/icons/Error';
import { apmeApiRef } from '../../api';

const useStyles = makeStyles(theme => ({
  scoreContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  scoreValue: {
    fontSize: '2rem',
    fontWeight: 'bold',
  },
  progressBar: {
    height: 10,
    borderRadius: 5,
    flexGrow: 1,
  },
  violationChips: {
    display: 'flex',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
    marginTop: theme.spacing(2),
  },
  blocker: {
    backgroundColor: theme.palette.error.dark,
    color: theme.palette.error.contrastText,
  },
  critical: {
    backgroundColor: theme.palette.error.main,
    color: theme.palette.error.contrastText,
  },
  major: {
    backgroundColor: theme.palette.warning.main,
    color: theme.palette.warning.contrastText,
  },
  minor: {
    backgroundColor: theme.palette.info.main,
    color: theme.palette.info.contrastText,
  },
  info: {
    backgroundColor: theme.palette.grey[500],
    color: theme.palette.common.white,
  },
}));

function getScoreColor(score: number): string {
  if (score >= 80) return '#4caf50';
  if (score >= 60) return '#ff9800';
  return '#f44336';
}

function getScoreIcon(score: number) {
  if (score >= 80) return <CheckCircleIcon style={{ color: '#4caf50' }} />;
  if (score >= 60) return <WarningIcon style={{ color: '#ff9800' }} />;
  return <ErrorIcon style={{ color: '#f44336' }} />;
}

export const ApmeHealthCard = () => {
  const classes = useStyles();
  const apmeApi = useApi(apmeApiRef);
  const { entity } = useEntity();

  const repoUrl =
    entity.metadata.annotations?.['backstage.io/source-location'] ||
    entity.metadata.annotations?.['github.com/project-slug'];

  const {
    value: project,
    loading,
    error,
  } = useAsync(async () => {
    if (!repoUrl) return null;
    return apmeApi.getProjectByRepoUrl(repoUrl);
  }, [repoUrl]);

  if (loading) {
    return (
      <InfoCard title="APME Health">
        <Progress />
      </InfoCard>
    );
  }

  if (error) {
    return (
      <InfoCard title="APME Health">
        <ResponseErrorPanel error={error} />
      </InfoCard>
    );
  }

  if (!project) {
    return (
      <InfoCard title="APME Health">
        <Typography variant="body2" color="textSecondary">
          No APME scan data available for this repository.
        </Typography>
      </InfoCard>
    );
  }

  const score = project.health_score ?? 0;
  const totalViolations = project.total_violations ?? 0;

  return (
    <InfoCard title="APME Health Score">
      <Box className={classes.scoreContainer}>
        {getScoreIcon(score)}
        <Typography
          className={classes.scoreValue}
          style={{ color: getScoreColor(score) }}
        >
          {score}%
        </Typography>
        <LinearProgress
          className={classes.progressBar}
          variant="determinate"
          value={score}
          style={{
            backgroundColor: '#e0e0e0',
          }}
        />
      </Box>

      {project.last_scanned_at && (
        <Typography variant="caption" color="textSecondary">
          Last scanned: {new Date(project.last_scanned_at).toLocaleString()}
        </Typography>
      )}

      <Box className={classes.violationChips}>
        <Chip
          size="small"
          label={`${totalViolations} Total Violations`}
          className={totalViolations > 0 ? classes.major : classes.info}
        />
        {project.scan_count > 0 && (
          <Chip
            size="small"
            label={`${project.scan_count} Scans`}
            className={classes.info}
          />
        )}
        {project.violation_trend && (
          <Chip
            size="small"
            label={`Trend: ${project.violation_trend}`}
            className={classes.info}
          />
        )}
      </Box>
    </InfoCard>
  );
};
