/*
 * Copyright Red Hat
 */

import { useState } from 'react';
import { useAsync } from 'react-use';
import { useApi, configApiRef } from '@backstage/core-plugin-api';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  FormControlLabel,
  Grid,
  Link,
  Switch,
  Tab,
  Tabs,
  Typography,
  makeStyles,
} from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import { Table, Progress } from '@backstage/core-components';
import {
  SEVERITY_STYLES,
  normalizeSeverity,
} from '@ansible/backstage-apme-common/severity';
import { apmeApiRef } from '../../api';
import { useApmeEnabled } from '../../hooks/useApmeEnabled';

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
  tabs: {
    marginBottom: theme.spacing(2),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
}));

function connectionStatusLabel(
  healthLoading: boolean,
  connected: boolean,
): string {
  if (healthLoading) return 'Checking connection…';
  if (connected) return 'Connected';
  return 'Disconnected';
}

/** Quality settings tab for Git Repositories — Overview + Rules (Inc 8). */
export const ApmeQualitySettingsTab = () => {
  const classes = useStyles();
  const apmeApi = useApi(apmeApiRef);
  const configApi = useApi(configApiRef);
  const enabled = useApmeEnabled();
  const [subTab, setSubTab] = useState(0);
  const [overridesOnly, setOverridesOnly] = useState(false);

  const baseUrl =
    configApi.getOptionalString('ansible.apme.baseUrl') ??
    configApi.getOptionalString('apme.baseUrl') ??
    '—';

  const { value: health, loading: healthLoading } = useAsync(async () => {
    if (!enabled) return null;
    return apmeApi.getHealth();
  }, [enabled, apmeApi]);

  const { value: projects = [], loading: projectsLoading } =
    useAsync(async () => {
      if (!enabled) return [];
      return apmeApi.getProjects();
    }, [enabled, apmeApi]);

  const { value: rules = [], loading: rulesLoading } = useAsync(async () => {
    if (!enabled) return [];
    return apmeApi.getRules();
  }, [enabled, apmeApi]);

  if (!enabled) {
    return (
      <Typography variant="body2" color="textSecondary">
        Content quality scanning is disabled. Enable ansible.apme.enabled in
        configuration.
      </Typography>
    );
  }

  const connected =
    health?.status === 'healthy' || health?.status === 'degraded';
  const visibleRules = overridesOnly ? rules.filter(r => !r.enabled) : rules;

  return (
    <Box>
      <Tabs
        value={subTab}
        onChange={(_, v) => setSubTab(v)}
        className={classes.tabs}
      >
        <Tab label="Overview" />
        <Tab label="Rules" />
      </Tabs>

      {subTab === 0 && (
        <Card>
          <CardHeader
            title="Content quality scanning"
            subheader="Global settings"
          />
          <CardContent>
            <Typography variant="body2">
              {connected ? (
                <CheckCircleIcon
                  className={classes.connected}
                  fontSize="small"
                />
              ) : (
                <ErrorIcon className={classes.disconnected} fontSize="small" />
              )}
              {connectionStatusLabel(healthLoading, connected)}
            </Typography>
            <Grid container spacing={2} style={{ marginTop: 8 }}>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="textSecondary">
                  Gateway URL
                </Typography>
                <Typography variant="body2">{baseUrl}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="textSecondary">
                  Target AAP version
                </Typography>
                <Typography variant="body2">2.7 (ansible-core 2.17)</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="textSecondary">
                  Repositories scanned
                </Typography>
                <Typography variant="body2">
                  {projectsLoading ? '…' : projects.length}{' '}
                  <Link href="/self-service/repositories/catalog">
                    View catalog →
                  </Link>
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="textSecondary">
                  Scan schedule
                </Typography>
                <Chip size="small" label="On commit + manual" />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {subTab === 1 && (
        <Box>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overridesOnly}
                onChange={e => setOverridesOnly(e.target.checked)}
              />
            }
            label="Show overrides only"
          />
          <Typography
            variant="caption"
            color="textSecondary"
            display="block"
            style={{ marginBottom: 8 }}
          >
            {rules.length} registered · {rules.filter(r => !r.enabled).length}{' '}
            disabled
          </Typography>
          {rulesLoading ? (
            <Progress />
          ) : (
            <Table
              options={{ paging: true, pageSize: 20, search: true }}
              columns={[
                { title: 'Rule ID', field: 'id' },
                { title: 'Description', field: 'description' },
                { title: 'Name', field: 'name' },
                { title: 'Category', field: 'category' },
                {
                  title: 'Severity',
                  render: (row: (typeof rules)[0]) => {
                    const s = SEVERITY_STYLES[normalizeSeverity(row.severity)];
                    return s ? (
                      <Chip
                        size="small"
                        label={s.label}
                        style={{ backgroundColor: s.background, color: s.text }}
                      />
                    ) : (
                      row.severity
                    );
                  },
                },
                {
                  title: 'Status',
                  render: (row: (typeof rules)[0]) =>
                    row.enabled ? 'Active' : 'Inactive',
                },
                {
                  title: 'Enforced',
                  render: (row: (typeof rules)[0]) =>
                    row.enabled ? 'Yes' : 'No',
                },
              ]}
              data={visibleRules}
            />
          )}
        </Box>
      )}
    </Box>
  );
};
