import React from 'react';
import {
  Typography, Switch, Chip, Box, Collapse, IconButton,
  TextField, FormControl, InputLabel, Select, MenuItem,
  Radio, RadioGroup, FormControlLabel, Tooltip,
} from '@material-ui/core';
import SettingsIcon from '@material-ui/icons/Settings';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import InfoIcon from '@material-ui/icons/Info';
import type { FindingSeverity, MultiHostFinding } from '@ansible/backstage-compliance-common/types';
import { STATUS_COLORS } from '../shared/colors';

type RemediationScope = 'failed_only' | 'standardize_all';

export interface RuleSelection {
  enabled: boolean;
  expanded: boolean;
  scope: RemediationScope;
  parameters: Record<string, string | number | boolean>;
}

interface FindingCardProps {
  finding: MultiHostFinding;
  selection: RuleSelection;
  onToggle: (ruleId: string) => void;
  onToggleExpand: (ruleId: string) => void;
  onSetScope: (ruleId: string, scope: RemediationScope) => void;
  onUpdateParameter: (ruleId: string, paramName: string, value: string | number | boolean) => void;
  classes: Record<string, string>;
  getSeverityClass: (severity: FindingSeverity) => string;
}

function arePropsEqual(prev: FindingCardProps, next: FindingCardProps): boolean {
  if (prev.finding !== next.finding) return false;
  if (prev.selection.enabled !== next.selection.enabled) return false;
  if (prev.selection.expanded !== next.selection.expanded) return false;
  if (prev.selection.scope !== next.selection.scope) return false;
  if (prev.classes !== next.classes) return false;
  if (prev.getSeverityClass !== next.getSeverityClass) return false;
  if (prev.onToggle !== next.onToggle) return false;
  if (prev.onToggleExpand !== next.onToggleExpand) return false;
  if (prev.onSetScope !== next.onSetScope) return false;
  if (prev.onUpdateParameter !== next.onUpdateParameter) return false;
  const prevParams = prev.selection.parameters;
  const nextParams = next.selection.parameters;
  const prevKeys = Object.keys(prevParams);
  const nextKeys = Object.keys(nextParams);
  if (prevKeys.length !== nextKeys.length) return false;
  for (const key of prevKeys) {
    if (prevParams[key] !== nextParams[key]) return false;
  }
  return true;
}

export const FindingCard = React.memo(({
  finding,
  selection: sel,
  onToggle,
  onToggleExpand,
  onSetScope,
  onUpdateParameter,
  classes,
  getSeverityClass,
}: FindingCardProps) => {
  return (
    <div className={`${classes.findingCard} ${sel.enabled ? classes.findingEnabled : classes.findingDisabled}`}>
      <div className={classes.findingHeader}>
        <Switch checked={sel.enabled} onChange={() => onToggle(finding.ruleId)} color="primary" size="small" disabled={finding.automationAvailable === false} inputProps={{ 'aria-label': `Toggle rule ${finding.stigId} for remediation` }} />
        {finding.automationAvailable === false && (<Chip label="Manual" size="small" variant="outlined" style={{ color: STATUS_COLORS.neutral, borderColor: STATUS_COLORS.neutral, fontSize: '0.7rem' }} />)}
        {finding.stigId && <Chip label={finding.stigId} size="small" variant="outlined" style={{ fontFamily: 'monospace', fontSize: '0.75rem' }} />}
        <Chip label={finding.severity === 'CAT_I' ? 'CAT I' : finding.severity === 'CAT_II' ? 'CAT II' : 'CAT III'} size="small" className={`${classes.severityChip} ${getSeverityClass(finding.severity)}`} />
        <div className={classes.titleGroup}>
          <Typography variant="subtitle2">{finding.title}</Typography>
          <div className={classes.hostBreakdown}>
            {finding.failCount > 0 ? (
              <>
                <span style={{ color: STATUS_COLORS.error, fontWeight: 600 }}>{finding.failCount} failed</span><span>/</span><span>{finding.totalCount} hosts</span>
                {finding.hosts.filter(h => h.status === 'fail').length > 0 && (<span style={{ color: STATUS_COLORS.neutral }}>({finding.hosts.filter(h => h.status === 'fail').map(h => h.host).join(', ')})</span>)}
              </>
            ) : (
              <span style={{ color: STATUS_COLORS.success, fontWeight: 600 }}>{finding.passCount}/{finding.totalCount} hosts passing</span>
            )}
          </div>
        </div>
        {finding.disruption === 'high' && (<Chip label="High disruption" size="small" color="secondary" style={{ fontSize: '0.7rem', fontWeight: 600 }} />)}
        {finding.aapImpact === 'breaks-connectivity' && (
          <Chip label="Breaks AAP" size="small" style={{ backgroundColor: STATUS_COLORS.error, color: '#fff', fontSize: '0.7rem', fontWeight: 600 }} />
        )}
        {finding.aapImpact === 'caution' && (
          <Chip label="AAP caution" size="small" style={{ backgroundColor: STATUS_COLORS.warning, color: '#fff', fontSize: '0.7rem', fontWeight: 600 }} />
        )}
        <IconButton size="small" onClick={e => { e.stopPropagation(); onToggleExpand(finding.ruleId); }} aria-label={sel.expanded ? `Collapse rule details for ${finding.stigId}` : `Expand rule details for ${finding.stigId}`}>{sel.expanded ? <ExpandLessIcon /> : <SettingsIcon fontSize="small" />}</IconButton>
      </div>
      <Collapse in={sel.expanded}>
        <div className={classes.detailPanel}>
          {finding.description && (<Box mb={2}><Typography variant="body2">{finding.description}</Typography></Box>)}
          {(finding.checkText || finding.fixText) && (<Box mb={2} display="flex" flexDirection="column" style={{ gap: 12 }}>{finding.checkText && (<div><Typography variant="caption" color="textSecondary" style={{ fontWeight: 600 }}>Check</Typography><Typography variant="body2" style={{ fontFamily: 'monospace', fontSize: '0.8rem', marginTop: 2 }}>{finding.checkText}</Typography></div>)}{finding.fixText && (<div><Typography variant="caption" color="textSecondary" style={{ fontWeight: 600 }}>Fix</Typography><Typography variant="body2" style={{ fontFamily: 'monospace', fontSize: '0.8rem', marginTop: 2 }}>{finding.fixText}</Typography></div>)}</Box>)}
          {finding.disruption && (<Box mb={2} display="flex" style={{ gap: 8 }}><Chip size="small" label={`Disruption: ${finding.disruption}`} style={{ backgroundColor: finding.disruption === 'high' ? STATUS_COLORS.error : finding.disruption === 'medium' ? STATUS_COLORS.warning : STATUS_COLORS.success, color: '#fff', fontWeight: 600 }} />{finding.aapImpact === 'breaks-connectivity' && (<Tooltip title={finding.aapImpactReason}><Chip size="small" label="Breaks AAP connectivity" style={{ backgroundColor: STATUS_COLORS.error, color: '#fff', fontWeight: 600 }} /></Tooltip>)}{finding.aapImpact === 'caution' && (<Tooltip title={finding.aapImpactReason}><Chip size="small" label="AAP caution" style={{ backgroundColor: STATUS_COLORS.warning, color: '#fff', fontWeight: 600 }} /></Tooltip>)}</Box>)}
          {finding.passCount > 0 && finding.failCount > 0 && (<div className={classes.adviceBanner}><InfoIcon className={classes.adviceIcon} fontSize="small" /><div><Typography variant="body2" style={{ color: '#856404', fontWeight: 600 }}>Only {finding.failCount} of {finding.totalCount} hosts failed this rule.</Typography><Typography variant="caption" style={{ color: '#856404' }}>Consider whether {finding.hosts.filter(h => h.status === 'fail').map(h => h.host).join(', ')} should belong to a different inventory with different compliance requirements.</Typography></div></div>)}
          <div className={classes.remediationStrategy}>
            <Typography variant="caption" color="textSecondary" gutterBottom>Remediation Scope</Typography>
            {finding.failCount === 0 ? (
              <Typography variant="body2" color="textSecondary" style={{ marginTop: 4 }}>All {finding.totalCount} hosts are compliant {'—'} enabling this rule enforces continuous compliance.</Typography>
            ) : finding.failCount === finding.totalCount ? (<Typography variant="body2" color="textSecondary" style={{ marginTop: 4 }}>All {finding.totalCount} hosts failed {'—'} remediation will apply to all hosts.</Typography>) : (
              <RadioGroup value={sel.scope} onChange={e => onSetScope(finding.ruleId, e.target.value as RemediationScope)}>
                <FormControlLabel value="failed_only" control={<Radio size="small" color="primary" />} label={<Typography variant="body2">Remediate failed hosts only ({finding.failCount} hosts)</Typography>} />
                <FormControlLabel value="standardize_all" control={<Radio size="small" color="primary" />} label={<Typography variant="body2">Apply to all hosts {'—'} standardize to same setting ({finding.totalCount} hosts)</Typography>} />
              </RadioGroup>)}
          </div>
          {finding.parameters.length > 0 && (<Box mt={2}><Typography variant="caption" color="textSecondary" gutterBottom>Parameters{sel.scope === 'standardize_all' && (<span style={{ fontStyle: 'italic' }}> {'—'} applied to all {finding.totalCount} hosts</span>)}</Typography><Box display="flex" flexWrap="wrap" style={{ gap: 16, marginTop: 8 }}>{finding.parameters.map(param => (<div key={param.name} style={{ flex: '1 1 200px', maxWidth: 300 }}>{param.type === 'select' ? (<FormControl variant="outlined" size="small" fullWidth><InputLabel>{param.label}</InputLabel><Select value={sel.parameters[param.name] ?? param.default} onChange={e => onUpdateParameter(finding.ruleId, param.name, e.target.value as string)} label={param.label}>{param.options?.map(opt => (<MenuItem key={String(opt.value)} value={opt.value}>{opt.label}</MenuItem>))}</Select></FormControl>) : (<TextField label={param.label} variant="outlined" size="small" fullWidth type={param.type === 'number' ? 'number' : 'text'} value={sel.parameters[param.name] ?? param.default} onChange={e => onUpdateParameter(finding.ruleId, param.name, param.type === 'number' ? Number(e.target.value) : e.target.value)} helperText={param.description} />)}</div>))}</Box></Box>)}
          {finding.hosts.filter(h => h.status === 'fail').length > 0 && (
            <Box mt={2}><Typography variant="caption" color="textSecondary">Failed Hosts {'—'} Actual Values</Typography><Box mt={1}>{finding.hosts.filter(h => h.status === 'fail').map(h => (<Box key={h.host} display="flex" style={{ gap: 16 }} py={0.5}><Typography variant="body2" style={{ fontFamily: 'monospace', minWidth: 120 }}>{h.host}</Typography><Typography variant="body2" style={{ fontFamily: 'monospace', color: STATUS_COLORS.error }}>{h.actualValue}</Typography><Typography variant="caption" color="textSecondary">(expected: {h.expectedValue})</Typography></Box>))}</Box></Box>
          )}
        </div>
      </Collapse>
    </div>
  );
}, arePropsEqual);
FindingCard.displayName = 'FindingCard';
