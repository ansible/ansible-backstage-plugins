import React, { useCallback, useEffect, useState } from 'react';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { Content, ContentHeader, Progress, WarningPanel, Table, TableColumn } from '@backstage/core-components';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, FormControlLabel, InputLabel,
  MenuItem, Select, Switch, Typography,
} from '@material-ui/core';
import { apmeApiRef } from '../api/ApmeApi';
import type { RuleDetail } from '../types/api';

export const RulesPage = () => {
  const api = useApi(apmeApiRef);
  const { value: rules, loading, error, retry } = useAsync(() => api.listRules());
  const [editingRule, setEditingRule] = useState<RuleDetail | null>(null);

  if (loading) return <Progress />;
  if (error) return <WarningPanel title="Failed to load rules">{error.message}</WarningPanel>;

  const columns: TableColumn[] = [
    { title: 'Rule ID', field: 'rule_id' },
    { title: 'Category', field: 'category' },
    { title: 'Source', field: 'source' },
    { title: 'Severity', field: 'effective_severity', render: (row: any) => <Chip label={row.effective_severity} size="small" color={row.effective_severity_int >= 3 ? 'secondary' : 'default'} /> },
    { title: 'Description', field: 'description' },
    { title: 'Enabled', field: 'enabled', render: (row: any) => row.enabled ? <Chip label="Yes" size="small" color="primary" /> : <Chip label="No" size="small" /> },
    { title: 'Override', field: 'has_override', render: (row: any) => row.has_override ? <Chip label="Yes" size="small" color="secondary" /> : null },
    { title: 'Actions', render: (row: any) => <Button size="small" onClick={() => setEditingRule(row as RuleDetail)}>Configure</Button> },
  ];

  return (
    <Content>
      <ContentHeader title="Rule Catalog" />
      <Table title="Rules" columns={columns} data={rules ?? []} options={{ search: true, paging: true, pageSize: 25 }} />
      {editingRule && (
        <RuleConfigDialog rule={editingRule} onClose={() => setEditingRule(null)} onSaved={() => { setEditingRule(null); retry(); }} />
      )}
    </Content>
  );
};

const SEVERITY_OPTIONS = [
  { value: 0, label: 'Default' },
  { value: 1, label: 'Info' },
  { value: 2, label: 'Warning' },
  { value: 3, label: 'Error' },
  { value: 4, label: 'Critical' },
];

function RuleConfigDialog({ rule, onClose, onSaved }: { rule: RuleDetail; onClose: () => void; onSaved: () => void }) {
  const api = useApi(apmeApiRef);
  const [severity, setSeverity] = useState<number>(0);
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
    setSaving(true); setError('');
    try {
      await api.updateRuleConfig(rule.rule_id, {
        severity_override: severity > 0 ? severity : undefined,
        enabled_override: enabled,
        enforced,
      });
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  }, [api, rule, severity, enabled, enforced, onSaved]);

  const handleReset = useCallback(async () => {
    setSaving(true); setError('');
    try { await api.deleteRuleConfig(rule.rule_id); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Reset failed'); }
    finally { setSaving(false); }
  }, [api, rule, onSaved]);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Configure Rule: {rule.rule_id}</DialogTitle>
      <DialogContent>
        {error && <Box mb={2} style={{ color: '#f44336' }}>{error}</Box>}
        <Typography variant="body2" color="textSecondary" gutterBottom>{rule.description}</Typography>
        <Typography variant="caption" color="textSecondary">Category: {rule.category} · Source: {rule.source} · Default: {rule.default_severity}</Typography>

        <Box mt={2}>
          <FormControl fullWidth margin="dense">
            <InputLabel>Severity Override</InputLabel>
            <Select value={severity} onChange={e => setSeverity(e.target.value as number)}>
              {SEVERITY_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
        <Box mt={1}>
          <FormControlLabel control={<Switch checked={enabled} onChange={e => setEnabled(e.target.checked)} />} label="Enabled" />
        </Box>
        <Box>
          <FormControlLabel control={<Switch checked={enforced} onChange={e => setEnforced(e.target.checked)} />} label="Enforced (cannot be disabled by users)" />
        </Box>
      </DialogContent>
      <DialogActions>
        {rule.has_override && <Button onClick={handleReset} disabled={saving} color="secondary">Reset to Default</Button>}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}
