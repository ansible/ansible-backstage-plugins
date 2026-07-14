/*
 * Copyright Red Hat
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAsyncRetry } from 'react-use';
import { useApi, configApiRef } from '@backstage/core-plugin-api';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  FormControlLabel,
  Grid,
  IconButton,
  Link,
  MenuItem,
  Select,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  makeStyles,
} from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import RefreshIcon from '@material-ui/icons/Refresh';
import UndoIcon from '@material-ui/icons/Undo';
import { Table, Progress } from '@backstage/core-components';
import type { Rule } from '@ansible/backstage-apme-common/types';
import {
  SEVERITY_STYLES,
  SEVERITY_ORDER,
  normalizeSeverity,
  severityLabelToProto,
  severityLevelToCatalogSeverity,
} from '@ansible/backstage-apme-common/severity';
import { apmeApiRef } from '../../api';
import { useApmeEnabled } from '../../hooks/useApmeEnabled';
import { useApmeScanTargetLabel } from '../../hooks/useApmeScanTargetLabel';

const SEVERITY_OPTIONS = SEVERITY_ORDER;

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
  ruleToolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
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

/** Quality settings tab for Git Repositories — Overview + Rules admin. */
export const ApmeQualitySettingsTab = () => {
  const classes = useStyles();
  const apmeApi = useApi(apmeApiRef);
  const configApi = useApi(configApiRef);
  const enabled = useApmeEnabled();
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionFromUrl = searchParams.get('section');
  const [subTab, setSubTab] = useState(() =>
    sectionFromUrl === 'rules' ? 1 : 0,
  );
  const [overridesOnly, setOverridesOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [rules, setRules] = useState<Rule[]>([]);
  const [savingRuleId, setSavingRuleId] = useState<string | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);

  const baseUrl =
    configApi.getOptionalString('ansible.apme.baseUrl') ??
    configApi.getOptionalString('apme.baseUrl') ??
    '—';

  const { value: health, loading: healthLoading } = useAsyncRetry(async () => {
    if (!enabled) return null;
    return apmeApi.getHealth();
  }, [enabled, apmeApi]);

  const { value: projects = [], loading: projectsLoading } =
    useAsyncRetry(async () => {
      if (!enabled) return [];
      return apmeApi.getProjects();
    }, [enabled, apmeApi]);

  const { loading: rulesLoading, retry: reloadRules } =
    useAsyncRetry(async () => {
      if (!enabled) {
        setRules([]);
        return [];
      }
      setRulesError(null);
      const fetched = await apmeApi.getRules();
      setRules(fetched);
      return fetched;
    }, [enabled, apmeApi]);

  const updateRuleLocal = useCallback(
    (ruleId: string, patch: Partial<Rule>) => {
      setRules(prev =>
        prev.map(rule => (rule.id === ruleId ? { ...rule, ...patch } : rule)),
      );
    },
    [],
  );

  const handleEnabledChange = useCallback(
    async (rule: Rule, enabledFlag: boolean) => {
      setSavingRuleId(rule.id);
      setRulesError(null);
      updateRuleLocal(rule.id, { enabled: enabledFlag, hasOverride: true });
      try {
        const updated = await apmeApi.updateRuleConfig(rule.id, {
          enabled_override: enabledFlag,
        });
        updateRuleLocal(rule.id, updated);
      } catch (err) {
        setRulesError((err as Error).message);
        void reloadRules();
      } finally {
        setSavingRuleId(null);
      }
    },
    [apmeApi, reloadRules, updateRuleLocal],
  );

  const handleEnforcedChange = useCallback(
    async (rule: Rule, enforced: boolean) => {
      setSavingRuleId(rule.id);
      setRulesError(null);
      updateRuleLocal(rule.id, { enforced, hasOverride: true });
      try {
        const updated = await apmeApi.updateRuleConfig(rule.id, { enforced });
        updateRuleLocal(rule.id, updated);
      } catch (err) {
        setRulesError((err as Error).message);
        void reloadRules();
      } finally {
        setSavingRuleId(null);
      }
    },
    [apmeApi, reloadRules, updateRuleLocal],
  );

  const handleSeverityChange = useCallback(
    async (rule: Rule, severity: string) => {
      setSavingRuleId(rule.id);
      setRulesError(null);
      const normalized = normalizeSeverity(severity);
      updateRuleLocal(rule.id, {
        severity: severityLevelToCatalogSeverity(normalized),
        hasOverride: true,
      });
      try {
        const updated = await apmeApi.updateRuleConfig(rule.id, {
          severity_override: severityLabelToProto(severity),
        });
        updateRuleLocal(rule.id, updated);
      } catch (err) {
        setRulesError((err as Error).message);
        void reloadRules();
      } finally {
        setSavingRuleId(null);
      }
    },
    [apmeApi, reloadRules, updateRuleLocal],
  );

  const handleResetOverride = useCallback(
    async (ruleId: string) => {
      setSavingRuleId(ruleId);
      setRulesError(null);
      try {
        await apmeApi.deleteRuleConfig(ruleId);
        void reloadRules();
      } catch (err) {
        setRulesError((err as Error).message);
      } finally {
        setSavingRuleId(null);
      }
    },
    [apmeApi, reloadRules],
  );

  const visibleRules = useMemo(() => {
    let list = overridesOnly ? rules.filter(r => r.hasOverride) : rules;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        r =>
          r.id.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          (r.source ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [rules, overridesOnly, search]);

  const overrideCount = rules.filter(r => r.hasOverride).length;
  const scanTargetLabel = useApmeScanTargetLabel();

  useEffect(() => {
    if (sectionFromUrl === 'rules') {
      setSubTab(1);
    } else if (sectionFromUrl === 'overview') {
      setSubTab(0);
    }
  }, [sectionFromUrl]);

  const handleSubTabChange = useCallback(
    (_: unknown, value: number) => {
      setSubTab(value);
      const next = new URLSearchParams(searchParams);
      next.set('section', value === 1 ? 'rules' : 'overview');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const openRulesTab = useCallback(() => {
    setSubTab(1);
    const next = new URLSearchParams(searchParams);
    next.set('section', 'rules');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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

  let rulesSection: ReactNode;
  if (rulesLoading) {
    rulesSection = <Progress />;
  } else if (rules.length === 0) {
    rulesSection = (
      <Typography variant="body2" color="textSecondary">
        No rules returned from the gateway. Check the APME connection on the
        Overview tab, then use refresh above.
      </Typography>
    );
  } else {
    rulesSection = (
      <Table
        options={{
          paging: true,
          pageSize: 50,
          pageSizeOptions: [20, 50, 100, 200],
          search: false,
        }}
        columns={[
          { title: 'Rule ID', field: 'id', width: '8%' },
          { title: 'Description', field: 'description', width: '32%' },
          { title: 'Source', field: 'source', width: '8%' },
          { title: 'Category', field: 'category', width: '8%' },
          {
            title: 'Default',
            width: '10%',
            render: (row: Rule) => {
              const sev = row.defaultSeverity ?? row.severity;
              const s = SEVERITY_STYLES[normalizeSeverity(sev)];
              return s ? (
                <Chip
                  size="small"
                  label={s.label}
                  style={{ backgroundColor: s.background, color: s.text }}
                />
              ) : (
                sev
              );
            },
          },
          {
            title: 'Effective',
            width: '12%',
            render: (row: Rule) => (
              <Select
                value={normalizeSeverity(row.severity)}
                onChange={e =>
                  void handleSeverityChange(row, e.target.value as string)
                }
                disabled={savingRuleId === row.id}
                variant="outlined"
                style={{ fontSize: 12, minWidth: 100 }}
              >
                {SEVERITY_OPTIONS.map(sev => (
                  <MenuItem key={sev} value={sev}>
                    {sev}
                  </MenuItem>
                ))}
              </Select>
            ),
          },
          {
            title: 'Enabled',
            width: '8%',
            render: (row: Rule) => (
              <Switch
                size="small"
                checked={row.enabled}
                onChange={e => void handleEnabledChange(row, e.target.checked)}
                disabled={savingRuleId === row.id}
              />
            ),
          },
          {
            title: 'Enforced',
            width: '8%',
            render: (row: Rule) => (
              <Switch
                size="small"
                checked={row.enforced ?? false}
                onChange={e => void handleEnforcedChange(row, e.target.checked)}
                disabled={savingRuleId === row.id || !row.enabled}
              />
            ),
          },
          {
            title: '',
            width: '6%',
            render: (row: Rule) =>
              row.hasOverride ? (
                <Tooltip title="Reset to catalog default">
                  <IconButton
                    size="small"
                    onClick={() => void handleResetOverride(row.id)}
                    disabled={savingRuleId === row.id}
                  >
                    <UndoIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : null,
          },
        ]}
        data={visibleRules}
      />
    );
  }

  return (
    <Box>
      <Tabs
        value={subTab}
        onChange={handleSubTabChange}
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
                  Scan target
                </Typography>
                <Typography variant="body2">{scanTargetLabel}</Typography>
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
                  Registered rules
                </Typography>
                <Typography variant="body2">
                  {rulesLoading ? '…' : rules.length}{' '}
                  <Link
                    component="button"
                    variant="body2"
                    onClick={openRulesTab}
                    style={{ verticalAlign: 'baseline' }}
                  >
                    View rule catalog →
                  </Link>
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="textSecondary">
                  Rule overrides
                </Typography>
                <Typography variant="body2">
                  {rulesLoading ? '…' : `${overrideCount} active`}
                  {!rulesLoading && overrideCount > 0 && (
                    <>
                      {' '}
                      <Link
                        component="button"
                        variant="body2"
                        onClick={openRulesTab}
                        style={{ verticalAlign: 'baseline' }}
                      >
                        Manage →
                      </Link>
                    </>
                  )}
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
      )}

      {subTab === 1 && (
        <Box>
          <Box className={classes.ruleToolbar}>
            <Box
              display="flex"
              alignItems="center"
              flexWrap="wrap"
              style={{ gap: 8 }}
            >
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={overridesOnly}
                    onChange={e => setOverridesOnly(e.target.checked)}
                  />
                }
                label="Overrides only"
              />
              <TextField
                size="small"
                placeholder="Search rules…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ minWidth: 200 }}
              />
            </Box>
            <Tooltip title="Reload rules from gateway">
              <IconButton size="small" onClick={() => void reloadRules()}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <Typography
            variant="caption"
            color="textSecondary"
            display="block"
            style={{ marginBottom: 8 }}
          >
            {rules.length} registered · {overrideCount} with overrides ·{' '}
            {rules.filter(r => !r.enabled).length} disabled
          </Typography>
          {rulesError && (
            <Typography
              variant="body2"
              color="error"
              style={{ marginBottom: 8 }}
            >
              {rulesError}
            </Typography>
          )}
          {rulesSection}
        </Box>
      )}
    </Box>
  );
};
