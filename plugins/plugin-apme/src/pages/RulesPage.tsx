import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAsync, useAsyncRetry } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import {
  ContentHeader,
  Progress,
  WarningPanel,
  Table,
  TableColumn,
} from '@backstage/core-components';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@material-ui/core';
import CheckIcon from '@material-ui/icons/Check';
import RemoveIcon from '@material-ui/icons/Remove';
import { apmeApiRef } from '../api/ApmeApi';
import type { RuleDetail } from '../types/api';
import {
  bareRuleId,
  severityColor,
  SEVERITY_INT_OPTIONS,
} from '../components/severity';

export const RulesPage = () => {
  const api = useApi(apmeApiRef);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [search, setSearch] = useState('');
  const [detailRuleId, setDetailRuleId] = useState<string | null>(null);
  const [configRule, setConfigRule] = useState<RuleDetail | null>(null);

  const { value, loading, error, retry } = useAsyncRetry(async () => {
    const [stats, rules] = await Promise.all([
      api.getRuleStats(),
      api.listRules({
        category: filterCategory || undefined,
        source: filterSource || undefined,
      }),
    ]);
    return { stats, rules };
  }, [api, filterCategory, filterSource]);

  const stats = value?.stats;
  const rules = value?.rules ?? [];

  const categoryOptions = useMemo(
    () => Object.keys(stats?.by_category ?? {}).sort(),
    [stats],
  );
  const sourceOptions = useMemo(
    () => Object.keys(stats?.by_source ?? {}).sort(),
    [stats],
  );

  const filteredRules = useMemo(() => {
    if (!search.trim()) return rules;
    const q = search.trim().toLowerCase();
    return rules.filter(
      r =>
        r.rule_id.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q),
    );
  }, [rules, search]);

  const columns: TableColumn[] = [
    {
      title: 'Rule ID',
      field: 'rule_id',
      render: (row: any) => (
        <Button
          size="small"
          variant="text"
          onClick={() => setDetailRuleId(row.rule_id)}
          style={{
            fontFamily: 'monospace',
            textTransform: 'none',
            minWidth: 0,
            padding: '2px 4px',
          }}
        >
          {bareRuleId(row.rule_id)}
        </Button>
      ),
    },
    { title: 'Category', field: 'category' },
    { title: 'Source', field: 'source' },
    {
      title: 'Severity',
      field: 'effective_severity',
      render: (row: any) => {
        const bg = severityColor(row.effective_severity, row.rule_id);
        return (
          <Chip
            size="small"
            label={row.effective_severity}
            style={{ backgroundColor: bg, color: '#fff' }}
          />
        );
      },
    },
    {
      title: 'Enabled',
      field: 'enabled',
      render: (row: any) => <EnableToggle rule={row} onUpdated={retry} />,
    },
    {
      title: 'Enforced',
      field: 'enforced',
      render: (row: any) =>
        row.enforced ? (
          <CheckIcon fontSize="small" color="primary" titleAccess="Enforced" />
        ) : (
          <RemoveIcon
            fontSize="small"
            style={{ color: '#9e9e9e' }}
            titleAccess="Not enforced"
          />
        ),
    },
    {
      title: 'Has override',
      field: 'has_override',
      render: (row: any) =>
        row.has_override ? (
          <CheckIcon
            fontSize="small"
            color="secondary"
            titleAccess="Has override"
          />
        ) : (
          <RemoveIcon
            fontSize="small"
            style={{ color: '#9e9e9e' }}
            titleAccess="No override"
          />
        ),
    },
  ];

  return (
    <>
      <ContentHeader title="Rule Catalog" />

      {loading && <Progress />}
      {error && (
        <WarningPanel title="Failed to load rules">
          {error.message}
        </WarningPanel>
      )}

      {stats && (
        <Box mb={3}>
          <Grid container spacing={2}>
            <Grid item>
              <Typography
                variant="h6"
                component="span"
                style={{ marginRight: 8 }}
              >
                {stats.total}
              </Typography>
              <Typography
                variant="body2"
                color="textSecondary"
                component="span"
              >
                total rules
              </Typography>
            </Grid>
            <Grid item>
              <Typography
                variant="h6"
                component="span"
                style={{ marginRight: 8 }}
              >
                {stats.override_count}
              </Typography>
              <Typography
                variant="body2"
                color="textSecondary"
                component="span"
              >
                with config override
              </Typography>
            </Grid>
          </Grid>

          <Box mt={2}>
            <Typography variant="subtitle2" gutterBottom>
              By category
            </Typography>
            <Box display="flex" flexWrap="wrap" style={{ gap: 8 }}>
              {Object.entries(stats.by_category)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([k, n]) => (
                  <Chip
                    key={k}
                    size="small"
                    label={`${k}: ${n}`}
                    variant="outlined"
                  />
                ))}
            </Box>
          </Box>

          <Box mt={2}>
            <Typography variant="subtitle2" gutterBottom>
              By source
            </Typography>
            <Box display="flex" flexWrap="wrap" style={{ gap: 8 }}>
              {Object.entries(stats.by_source)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([k, n]) => (
                  <Chip
                    key={k}
                    size="small"
                    label={`${k}: ${n}`}
                    variant="outlined"
                  />
                ))}
            </Box>
          </Box>
        </Box>
      )}

      <Box
        display="flex"
        flexWrap="wrap"
        alignItems="center"
        style={{ gap: 16, marginBottom: 16 }}
      >
        <FormControl variant="outlined" size="small" style={{ minWidth: 200 }}>
          <InputLabel id="apme-rule-filter-category">Category</InputLabel>
          <Select
            labelId="apme-rule-filter-category"
            label="Category"
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value as string)}
          >
            <MenuItem value="">
              <em>All</em>
            </MenuItem>
            {categoryOptions.map(c => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl variant="outlined" size="small" style={{ minWidth: 200 }}>
          <InputLabel id="apme-rule-filter-source">Source</InputLabel>
          <Select
            labelId="apme-rule-filter-source"
            label="Source"
            value={filterSource}
            onChange={e => setFilterSource(e.target.value as string)}
          >
            <MenuItem value="">
              <em>All</em>
            </MenuItem>
            {sourceOptions.map(s => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size="small"
          variant="outlined"
          label="Search"
          placeholder="Rule ID or description"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </Box>

      <Table
        title="Rules"
        columns={columns}
        data={filteredRules}
        options={{
          pageSize: 25,
          search: false,
        }}
      />

      {detailRuleId && (
        <RuleDetailDialog
          ruleId={detailRuleId}
          onClose={() => setDetailRuleId(null)}
          onConfigure={r => {
            setConfigRule(r);
            setDetailRuleId(null);
          }}
        />
      )}

      {configRule && (
        <RuleConfigDialog
          rule={configRule}
          onClose={() => setConfigRule(null)}
          onSaved={() => {
            setConfigRule(null);
            retry();
          }}
        />
      )}
    </>
  );
};

function EnableToggle({
  rule,
  onUpdated,
}: {
  rule: RuleDetail;
  onUpdated: () => void;
}) {
  const api = useApi(apmeApiRef);
  const [busy, setBusy] = useState(false);

  const onChange: React.ComponentProps<typeof Switch>['onChange'] = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      setBusy(true);
      try {
        await api.updateRuleConfig(rule.rule_id, {
          enabled_override: !rule.enabled,
        });
        onUpdated();
      } catch {
        /* list refresh on success only; errors surface on next load */
      } finally {
        setBusy(false);
      }
    },
    [api, rule, onUpdated],
  );

  return (
    <Box
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
      data-apme-prevent-row
    >
      <FormControlLabel
        control={
          <Switch
            checked={rule.enabled}
            disabled={busy}
            onChange={onChange}
            color="primary"
          />
        }
        label=""
        style={{ margin: 0 }}
      />
    </Box>
  );
}

function RuleDetailDialog({
  ruleId,
  onClose,
  onConfigure,
}: {
  ruleId: string;
  onClose: () => void;
  onConfigure: (r: RuleDetail) => void;
}) {
  const api = useApi(apmeApiRef);
  const { value, loading, error } = useAsync(
    () => api.getRule(ruleId),
    [api, ruleId],
  );

  if (error) {
    return (
      <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Rule: {ruleId}</DialogTitle>
        <DialogContent>
          <WarningPanel title="Failed to load rule">
            {error.message}
          </WarningPanel>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  if (loading || !value) {
    return (
      <Dialog open onClose={onClose} fullWidth>
        <DialogContent>
          <Box py={2}>
            <Progress />
          </Box>
        </DialogContent>
      </Dialog>
    );
  }

  const r = value;
  const sevBg = severityColor(r.effective_severity, r.rule_id);
  const defBg = severityColor(r.default_severity, r.rule_id);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {bareRuleId(r.rule_id)}
        <Typography
          component="div"
          variant="caption"
          color="textSecondary"
          style={{ display: 'block' }}
        >
          {r.rule_id}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" paragraph>
          {r.description}
        </Typography>
        <Box mb={1}>
          <Typography variant="caption" color="textSecondary" display="block">
            Category: {r.category} · Source: {r.source}
          </Typography>
        </Box>
        <Box display="flex" flexWrap="wrap" style={{ gap: 8 }} mb={1}>
          <Box>
            <Typography variant="caption" color="textSecondary">
              Default severity
            </Typography>
            <div>
              <Chip
                size="small"
                label={r.default_severity}
                style={{ backgroundColor: defBg, color: '#fff' }}
              />
            </div>
          </Box>
          <Box>
            <Typography variant="caption" color="textSecondary">
              Effective severity
            </Typography>
            <div>
              <Chip
                size="small"
                label={r.effective_severity}
                style={{ backgroundColor: sevBg, color: '#fff' }}
              />
            </div>
          </Box>
        </Box>
        <Typography variant="body2" color="textSecondary">
          Enabled: {r.enabled ? 'Yes' : 'No'} · Enforced:{' '}
          {r.enforced ? 'Yes' : 'No'} · Override:{' '}
          {r.has_override ? 'Yes' : 'No'}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onConfigure(r)}>Configure</Button>
        <Button onClick={onClose} color="primary" variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RuleConfigDialog({
  rule,
  onClose,
  onSaved,
}: {
  rule: RuleDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useApi(apmeApiRef);
  const [severity, setSeverity] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [enforced, setEnforced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSeverity(rule.has_override ? rule.effective_severity_int : 0);
    setEnabled(rule.enabled);
    setEnforced(rule.enforced);
  }, [rule]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      await api.updateRuleConfig(rule.rule_id, {
        severity_override: severity > 0 ? severity : undefined,
        enabled_override: enabled,
        enforced,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [api, rule, severity, enabled, enforced, onSaved]);

  const handleReset = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      await api.deleteRuleConfig(rule.rule_id);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setSaving(false);
    }
  }, [api, rule, onSaved]);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Configure rule: {bareRuleId(rule.rule_id)}</DialogTitle>
      <DialogContent>
        {error && (
          <Box mb={2} style={{ color: '#f44336' }}>
            {error}
          </Box>
        )}
        <Typography variant="body2" color="textSecondary" gutterBottom>
          {rule.description}
        </Typography>
        <Typography
          variant="caption"
          color="textSecondary"
          display="block"
          gutterBottom
        >
          Category: {rule.category} · Source: {rule.source} · Default:{' '}
          {rule.default_severity}
        </Typography>

        <Box mt={2}>
          <FormControl fullWidth margin="dense" variant="outlined">
            <InputLabel id="apme-severity-override">
              Severity override
            </InputLabel>
            <Select
              labelId="apme-severity-override"
              label="Severity override"
              value={severity}
              onChange={e => setSeverity(Number(e.target.value))}
            >
              <MenuItem value={0}>
                <em>Default</em>
              </MenuItem>
              {SEVERITY_INT_OPTIONS.map(o => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <Box mt={1}>
          <FormControlLabel
            control={
              <Switch
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
                color="primary"
              />
            }
            label="Enabled"
          />
        </Box>
        <Box>
          <FormControlLabel
            control={
              <Switch
                checked={enforced}
                onChange={e => setEnforced(e.target.checked)}
                color="primary"
              />
            }
            label="Enforced (cannot be disabled by users)"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        {rule.has_override && (
          <Button onClick={handleReset} disabled={saving} color="secondary">
            Reset to default
          </Button>
        )}
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
