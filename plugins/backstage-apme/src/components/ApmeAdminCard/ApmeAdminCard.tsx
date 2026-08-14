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
import { useApi, configApiRef } from '@backstage/core-plugin-api';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Grid,
  Typography,
  makeStyles,
} from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import { apmeApiRef } from '../../api';
import { useApmeEnabled } from '../../hooks/useApmeEnabled';
import { useApmeScanTargetLabel } from '../../hooks/useApmeScanTargetLabel';
import { PreviewLabelRow } from '../PreviewChip';

const useStyles = makeStyles(theme => ({
  connected: {
    color: theme.palette.success.main,
    verticalAlign: 'middle',
    marginRight: theme.spacing(1),
  },
  disconnected: {
    color: theme.palette.error.main,
    verticalAlign: 'middle',
    marginRight: theme.spacing(1),
  },
  stat: {
    marginTop: theme.spacing(1),
  },
}));

function getConnectionLabel(
  healthLoading: boolean,
  connected: boolean,
): string {
  if (healthLoading) {
    return 'Checking connection…';
  }
  if (connected) {
    return 'Connected';
  }
  return 'Disconnected';
}

/** Admin integration card for APME connection status. */
export const ApmeAdminCard = () => {
  const classes = useStyles();
  const apmeApi = useApi(apmeApiRef);
  const configApi = useApi(configApiRef);
  const enabled = useApmeEnabled();
  const baseUrl = configApi.getOptionalString('apme.baseUrl') ?? '—';
  const scanTarget = useApmeScanTargetLabel();

  const { value: health, loading: healthLoading } = useAsync(async () => {
    if (!enabled) return null;
    return apmeApi.getHealth();
  }, [enabled, apmeApi]);

  const { value: projects, loading: projectsLoading } = useAsync(async () => {
    if (!enabled) return [];
    return apmeApi.getProjects();
  }, [enabled, apmeApi]);

  if (!enabled) {
    return null;
  }

  const connected =
    health?.status === 'healthy' || health?.status === 'degraded';

  return (
    <Card>
      <Box padding={2} paddingBottom={0}>
        <PreviewLabelRow />
      </Box>
      <CardHeader
        title="APME Integration"
        subheader="Content quality scanning"
      />
      <CardContent>
        <Typography variant="body2">
          {connected ? (
            <CheckCircleIcon className={classes.connected} fontSize="small" />
          ) : (
            <ErrorIcon className={classes.disconnected} fontSize="small" />
          )}
          {getConnectionLabel(healthLoading, connected)}
        </Typography>
        <Grid container spacing={2} className={classes.stat}>
          <Grid item xs={12} sm={6}>
            <Typography variant="caption" color="textSecondary">
              Gateway URL
            </Typography>
            <Typography variant="body2">{baseUrl}</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="caption" color="textSecondary">
              Scan target
            </Typography>
            <Typography variant="body2">{scanTarget.label}</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="caption" color="textSecondary">
              Repositories scanned
            </Typography>
            <Typography variant="body2">
              {projectsLoading ? '…' : (projects?.length ?? 0)}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="caption" color="textSecondary">
              Scan schedule
            </Typography>
            <Typography variant="body2" component="div">
              <Chip size="small" label="On commit + manual" />
            </Typography>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};
