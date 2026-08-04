import { Fragment } from 'react';
import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import {
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Chip,
  Button,
  IconButton,
  Collapse,
  Toolbar,
  Tooltip,
  Snackbar,
  makeStyles,
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import Alert from '@material-ui/lab/Alert';
import type {
  TabWidget,
  ComplianceProfile,
} from '@ansible/backstage-compliance-common/types';
import { complianceApiRef } from '../../api';
import { SEVERITY_COLORS, SURFACE_COLORS } from '../shared/colors';
import { TABLE_STYLES } from '../shared/chipStyles';

const useStyles = makeStyles(theme => ({
  section: {
    marginBottom: theme.spacing(3),
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
  },
  unfixableSection: {
    opacity: 0.75,
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: theme.spacing(1, 2),
    backgroundColor: theme.palette.background.default,
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  detailBox: {
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.default,
  },
  chipFix: {
    backgroundColor: '#3E8635',
    color: '#fff',
    fontWeight: 600,
    fontSize: '0.75rem',
  },
  chipNoFix: {
    backgroundColor: '#6A6E73',
    color: '#fff',
    fontWeight: 600,
    fontSize: '0.75rem',
  },
  chipWontFix: {
    backgroundColor: '#A30000',
    color: '#fff',
    fontWeight: 600,
    fontSize: '0.75rem',
  },
  patchButton: {
    textTransform: 'none' as const,
    fontSize: '0.75rem',
  },
  monospace: {
    fontFamily: 'monospace',
    fontWeight: 600,
  },
  paginationNote: {
    padding: theme.spacing(1, 2),
    textAlign: 'center',
  },
}));

interface FindingRow {
  ruleId: string;
  stigId: string;
  host: string;
  status: string;
  severity: string;
  evidence: Record<string, unknown> | null;
  fixState: string;
  fixVersions: string[];
  installedVersion: string;
}

function parseEvidence(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

function parseFindingRows(
  rawFindings: Array<Record<string, unknown>>,
): FindingRow[] {
  return rawFindings.map(f => {
    const ev = parseEvidence(f.evidence);
    const fixVersions = Array.isArray(ev?.fix_versions)
      ? (ev.fix_versions as string[])
      : [];
    return {
      ruleId: String(f.ruleId ?? ''),
      stigId: String(f.stigId ?? ''),
      host: String(f.host ?? ''),
      status: String(f.status ?? ''),
      severity: String(f.severity ?? ''),
      evidence: ev,
      fixState: String(ev?.fix_state ?? 'unknown'),
      fixVersions,
      installedVersion: String(ev?.installed_version ?? ''),
    };
  });
}

interface GroupedFinding {
  ruleId: string;
  stigId: string;
  severity: string;
  fixState: string;
  fixVersions: string[];
  installedVersion: string;
  evidence: Record<string, unknown> | null;
  hosts: string[];
}

function groupByRule(rows: FindingRow[]): GroupedFinding[] {
  const map = new Map<string, GroupedFinding>();
  for (const r of rows) {
    if (r.status !== 'fail') continue;
    const existing = map.get(r.ruleId);
    if (existing) {
      if (!existing.hosts.includes(r.host)) existing.hosts.push(r.host);
    } else {
      map.set(r.ruleId, {
        ruleId: r.ruleId,
        stigId: r.stigId,
        severity: r.severity,
        fixState: r.fixState,
        fixVersions: r.fixVersions,
        installedVersion: r.installedVersion,
        evidence: r.evidence,
        hosts: [r.host],
      });
    }
  }
  return Array.from(map.values());
}

function severityColor(sev: string): string {
  return SEVERITY_COLORS[sev as keyof typeof SEVERITY_COLORS] ?? '#6A6E73';
}

const MAX_DISPLAY = 50;

interface Props {
  config: TabWidget;
  tabData: {
    findings: Array<Record<string, unknown>>;
    summary: { fixable: number; unfixable: number };
  } | null;
  profile: ComplianceProfile;
  severityLabel: (key: string) => string;
}

export const ActionTableWidget = ({
  config,
  tabData,
  profile,
  severityLabel,
}: Props) => {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useApi(complianceApiRef);

  const grouped = useMemo(() => {
    if (!tabData) return [];
    return groupByRule(parseFindingRows(tabData.findings));
  }, [tabData]);

  const fixable = useMemo(
    () =>
      grouped.filter(f => f.fixState === 'fixed' && f.fixVersions.length > 0),
    [grouped],
  );
  const unfixable = useMemo(
    () =>
      grouped.filter(f => f.fixState !== 'fixed' || f.fixVersions.length === 0),
    [grouped],
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [patchingId, setPatchingId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{
    message: string;
    severity: 'success' | 'error';
  } | null>(null);

  const displayFixable = fixable.slice(0, MAX_DISPLAY);
  const displayUnfixable = unfixable.slice(0, MAX_DISPLAY);

  const toggleSelect = useCallback((ruleId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selected.size === displayFixable.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(displayFixable.map(f => f.ruleId)));
    }
  }, [displayFixable, selected.size]);

  const handleQuickPatch = useCallback(
    async (finding: GroupedFinding) => {
      setPatchingId(finding.ruleId);
      try {
        await api.launchRemediation({
          profileId: profile.id,
          inventoryId: -1,
          selections: [
            { ruleId: finding.ruleId, enabled: true, parameters: {} },
          ],
          limit: finding.hosts.join(','),
        });
        setSnackbar({
          message: `Patch launched for ${finding.ruleId}`,
          severity: 'success',
        });
      } catch (err) {
        setSnackbar({
          message: `Patch failed: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`,
          severity: 'error',
        });
      } finally {
        setPatchingId(null);
      }
    },
    [api, profile.id],
  );

  const handleBuildRemediation = useCallback(() => {
    const preselect = Array.from(selected).join(',');
    navigate(
      `/compliance/remediation-builder?profileId=${profile.id}&preselect=${preselect}`,
    );
  }, [navigate, profile.id, selected]);

  if (!tabData) return null;

  const fixableLabel = config.fixable_label ?? 'Fix Available';
  const unfixableLabel = config.unfixable_label ?? 'No Fix / Monitor';
  const colLabels = config.labels ?? {};

  return (
    <Box>
      {config.title && (
        <Typography variant="subtitle2" color="textSecondary" gutterBottom>
          {config.title}
        </Typography>
      )}

      <Box className={classes.section}>
        <Box className={classes.sectionHeader}>
          <Chip
            label={`${fixableLabel} (${tabData.summary.fixable})`}
            className={classes.chipFix}
            size="small"
          />
        </Box>
        {displayFixable.length > 0 ? (
          <TableContainer component={Paper} variant="outlined">
            {selected.size > 0 && (
              <Toolbar className={classes.toolbar}>
                <Typography variant="body2">
                  {selected.size} selected
                </Typography>
                <Button
                  variant="contained"
                  color="primary"
                  size="small"
                  onClick={handleBuildRemediation}
                >
                  Build Remediation ({selected.size})
                </Button>
              </Toolbar>
            )}
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={
                        selected.size === displayFixable.length &&
                        displayFixable.length > 0
                      }
                      indeterminate={
                        selected.size > 0 &&
                        selected.size < displayFixable.length
                      }
                      onChange={selectAll}
                      size="small"
                    />
                  </TableCell>
                  <TableCell style={TABLE_STYLES.header}>
                    {colLabels.cve ?? 'CVE'}
                  </TableCell>
                  <TableCell style={TABLE_STYLES.header}>
                    {colLabels.package ?? 'Package'}
                  </TableCell>
                  <TableCell style={TABLE_STYLES.header}>
                    {colLabels.installed ?? 'Installed'}
                  </TableCell>
                  <TableCell style={TABLE_STYLES.header}>
                    {colLabels.fix_version ?? 'Fix Version'}
                  </TableCell>
                  <TableCell style={TABLE_STYLES.header}>
                    {colLabels.severity ?? 'Severity'}
                  </TableCell>
                  <TableCell style={TABLE_STYLES.header} align="right">
                    Action
                  </TableCell>
                  <TableCell padding="checkbox" />
                </TableRow>
              </TableHead>
              <TableBody>
                {displayFixable.map(f => {
                  const isExpanded = expandedId === f.ruleId;
                  return (
                    <Fragment key={f.ruleId}>
                      <TableRow hover>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={selected.has(f.ruleId)}
                            onChange={() => toggleSelect(f.ruleId)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            className={classes.monospace}
                          >
                            {f.ruleId}
                          </Typography>
                        </TableCell>
                        <TableCell>{f.stigId}</TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            className={classes.monospace}
                          >
                            {f.installedVersion || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            className={classes.monospace}
                          >
                            {f.fixVersions[0] ?? '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={severityLabel(f.severity)}
                            size="small"
                            style={{
                              backgroundColor: severityColor(f.severity),
                              color: SURFACE_COLORS.onDark,
                              fontWeight: 600,
                              fontSize: '0.7rem',
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            variant="outlined"
                            size="small"
                            color="primary"
                            className={classes.patchButton}
                            disabled={patchingId === f.ruleId}
                            onClick={() => handleQuickPatch(f)}
                          >
                            {patchingId === f.ruleId ? 'Patching...' : 'Patch'}
                          </Button>
                        </TableCell>
                        <TableCell padding="checkbox">
                          <IconButton
                            size="small"
                            onClick={() =>
                              setExpandedId(isExpanded ? null : f.ruleId)
                            }
                          >
                            {isExpanded ? (
                              <ExpandLessIcon />
                            ) : (
                              <ExpandMoreIcon />
                            )}
                          </IconButton>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          style={{
                            padding: 0,
                            borderBottom: isExpanded ? undefined : 'none',
                          }}
                        >
                          <Collapse in={isExpanded}>
                            <Box className={classes.detailBox}>
                              {f.evidence?.cvss_score !== undefined && (
                                <Typography
                                  variant="body2"
                                  color="textSecondary"
                                  gutterBottom
                                >
                                  CVSS Score: {String(f.evidence.cvss_score)}
                                  {f.evidence?.cvss_vector
                                    ? ` (${String(f.evidence.cvss_vector)})`
                                    : ''}
                                </Typography>
                              )}
                              <Typography variant="body2" color="textSecondary">
                                Affected hosts ({f.hosts.length}):{' '}
                                {f.hosts.slice(0, 10).join(', ')}
                                {f.hosts.length > 10
                                  ? ` ... +${f.hosts.length - 10} more`
                                  : ''}
                              </Typography>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            {fixable.length > MAX_DISPLAY && (
              <Typography
                variant="body2"
                color="textSecondary"
                className={classes.paginationNote}
              >
                Showing {MAX_DISPLAY} of {fixable.length} fixable findings. Use
                the Results tab for full details.
              </Typography>
            )}
          </TableContainer>
        ) : (
          <Typography variant="body2" color="textSecondary">
            No fixable vulnerabilities found.
          </Typography>
        )}
      </Box>

      {unfixable.length > 0 && (
        <Box className={`${classes.section} ${classes.unfixableSection}`}>
          <Box className={classes.sectionHeader}>
            <Chip
              label={`${unfixableLabel} (${tabData.summary.unfixable})`}
              className={classes.chipNoFix}
              size="small"
            />
          </Box>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell style={TABLE_STYLES.header}>
                    {colLabels.cve ?? 'CVE'}
                  </TableCell>
                  <TableCell style={TABLE_STYLES.header}>
                    {colLabels.package ?? 'Package'}
                  </TableCell>
                  <TableCell style={TABLE_STYLES.header}>
                    {colLabels.severity ?? 'Severity'}
                  </TableCell>
                  <TableCell style={TABLE_STYLES.header}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {displayUnfixable.map(f => (
                  <TableRow key={f.ruleId}>
                    <TableCell>
                      <Typography variant="body2" className={classes.monospace}>
                        {f.ruleId}
                      </Typography>
                    </TableCell>
                    <TableCell>{f.stigId}</TableCell>
                    <TableCell>
                      <Chip
                        label={severityLabel(f.severity)}
                        size="small"
                        style={{
                          backgroundColor: severityColor(f.severity),
                          color: SURFACE_COLORS.onDark,
                          fontWeight: 600,
                          fontSize: '0.7rem',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip
                        title={
                          f.fixState === 'wont-fix'
                            ? 'Vendor has declined to fix'
                            : 'No vendor fix available yet'
                        }
                      >
                        <Chip
                          label={
                            f.fixState === 'wont-fix' ? "Won't Fix" : 'No Fix'
                          }
                          className={
                            f.fixState === 'wont-fix'
                              ? classes.chipWontFix
                              : classes.chipNoFix
                          }
                          size="small"
                        />
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {unfixable.length > MAX_DISPLAY && (
              <Typography
                variant="body2"
                color="textSecondary"
                className={classes.paginationNote}
              >
                Showing {MAX_DISPLAY} of {unfixable.length} unfixable findings.
              </Typography>
            )}
          </TableContainer>
        </Box>
      )}

      <Snackbar
        open={!!snackbar}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
      >
        {snackbar ? (
          <Alert severity={snackbar.severity} onClose={() => setSnackbar(null)}>
            {snackbar.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
};
