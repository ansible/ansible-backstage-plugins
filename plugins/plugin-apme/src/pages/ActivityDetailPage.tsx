import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAsyncRetry } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import {
  ContentHeader,
  Progress,
  WarningPanel,
} from '@backstage/core-components';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@material-ui/core';
import DeleteIcon from '@material-ui/icons/Delete';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import GitHubIcon from '@material-ui/icons/GitHub';
import { apmeApiRef } from '../api/ApmeApi';
import { DiffView } from '../components/DiffView';
import { timeAgo } from '../components/format';
import { PipelineLogOutput } from '../components/PipelineLogOutput';
import {
  bareRuleId,
  severityClass,
  severityColor,
  severityLabel,
  severityOrder,
} from '../components/severity';
import { ViolationStatusBar } from '../components/ViolationStatusBar';
import type { PatchDetail, ViolationDetail } from '../types/api';

function buildLineDiff(
  pathLabel: string,
  original: string,
  fixed: string,
): string {
  const a = (original || '').split('\n');
  const b = (fixed || '').split('\n');
  const out: string[] = [`--- a/${pathLabel}`, `+++ b/${pathLabel}`];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const o = a[i];
    const f = b[i];
    if (o === f) {
      out.push(` ${(o ?? '') || ' '}`);
    } else {
      if (o !== undefined) out.push(`-${o}`);
      if (f !== undefined) out.push(`+${f}`);
    }
  }
  return out.join('\n');
}

function formatDiagnostics(diagnosticsJson: string | null): {
  pretty: string;
  isJson: boolean;
} {
  if (!diagnosticsJson) return { pretty: '', isJson: false };
  try {
    return {
      pretty: JSON.stringify(JSON.parse(diagnosticsJson), null, 2),
      isJson: true,
    };
  } catch {
    return { pretty: diagnosticsJson, isJson: false };
  }
}

export const ActivityDetailPage = () => {
  const { activityId } = useParams<{ activityId: string }>();
  const navigate = useNavigate();
  const api = useApi(apmeApiRef);

  const {
    value: activity,
    loading,
    error,
    retry,
  } = useAsyncRetry(() => api.getActivity(activityId!), [activityId, api]);

  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [ruleFilter, setRuleFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [prBusy, setPrBusy] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const ruleOptions = useMemo(() => {
    if (!activity?.violations) return [] as string[];
    const s = new Set<string>();
    for (const v of activity.violations) s.add(v.rule_id);
    return Array.from(s).sort();
  }, [activity?.violations]);

  const filteredViolations = useMemo(() => {
    if (!activity) return [] as ViolationDetail[];
    const q = search.trim().toLowerCase();
    return activity.violations
      .filter(v => {
        if (
          severityFilter !== 'all' &&
          severityClass(v.level, v.rule_id) !== severityFilter
        )
          return false;
        if (ruleFilter !== 'all' && v.rule_id !== ruleFilter) return false;
        if (!q) return true;
        return (
          v.message.toLowerCase().includes(q) ||
          v.file.toLowerCase().includes(q) ||
          v.rule_id.toLowerCase().includes(q) ||
          (v.path && v.path.toLowerCase().includes(q))
        );
      })
      .sort(
        (a, b) =>
          severityOrder(severityClass(a.level, a.rule_id)) -
            severityOrder(severityClass(b.level, b.rule_id)) ||
          (a.file || '').localeCompare(b.file || '') ||
          (a.line ?? 0) - (b.line ?? 0),
      );
  }, [activity, ruleFilter, search, severityFilter]);

  const canCreatePr =
    !!activity &&
    (activity.patches?.length ?? 0) > 0 &&
    /remediate/i.test(activity.scan_type) &&
    !activity.pr_url;

  const handleDelete = useCallback(async () => {
    if (!activityId) return;
    if (!window.confirm('Delete this scan activity? This cannot be undone.'))
      return;
    setActionError(null);
    setDeleting(true);
    try {
      await api.deleteActivity(activityId);
      navigate('..', { relative: 'path' });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }, [api, activityId, navigate]);

  const handleCreatePr = useCallback(async () => {
    if (!activityId) return;
    setPrError(null);
    setPrBusy(true);
    try {
      await api.createPullRequest(activityId, {});
      await retry();
    } catch (e) {
      setPrError(
        e instanceof Error ? e.message : 'Failed to create pull request',
      );
    } finally {
      setPrBusy(false);
    }
  }, [api, activityId, retry]);

  if (loading) return <Progress />;
  if (error)
    return (
      <WarningPanel title="Failed to load activity">
        {error.message}
      </WarningPanel>
    );
  if (!activity) return <WarningPanel title="Activity not found" />;

  const diag = formatDiagnostics(activity.diagnostics_json);

  return (
    <>
      <ContentHeader title={`Scan ${activity.scan_id.slice(0, 8)}`} />

      {actionError && (
        <Box mb={2}>
          <WarningPanel title="Action failed">{actionError}</WarningPanel>
        </Box>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box
                display="flex"
                flexWrap="wrap"
                alignItems="flex-start"
                justifyContent="space-between"
                style={{ gap: 16 }}
              >
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Summary
                  </Typography>
                  <Box
                    display="flex"
                    flexWrap="wrap"
                    style={{ gap: 8, marginBottom: 8 }}
                    alignItems="center"
                  >
                    <Chip size="small" label={`Type: ${activity.scan_type}`} />
                    {activity.pr_url && (
                      <Chip
                        size="small"
                        color="primary"
                        icon={<GitHubIcon style={{ fontSize: 16 }} />}
                        label="Open PR"
                        clickable
                        component="a"
                        href={activity.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    )}
                  </Box>
                  {activity.pr_url && (
                    <Typography
                      variant="body2"
                      style={{ marginBottom: 8, wordBreak: 'break-all' }}
                    >
                      PR URL:{' '}
                      <Link
                        href={activity.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {activity.pr_url}
                      </Link>
                    </Typography>
                  )}
                  <Typography
                    variant="body2"
                    color="textSecondary"
                    gutterBottom
                  >
                    Project path
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    {activity.project_path}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Created {timeAgo(activity.created_at)} ·{' '}
                    {new Date(activity.created_at).toLocaleString()}
                  </Typography>
                </Box>
                <Box
                  display="flex"
                  flexDirection="column"
                  style={{ gap: 8, minWidth: 180 }}
                >
                  <Button
                    variant="outlined"
                    color="primary"
                    disabled={!canCreatePr || prBusy}
                    onClick={handleCreatePr}
                    startIcon={<GitHubIcon />}
                  >
                    {prBusy ? 'Creating…' : 'Create PR'}
                  </Button>
                  {!canCreatePr &&
                    (activity.patches?.length ?? 0) > 0 &&
                    activity.pr_url && (
                      <Typography variant="caption" color="textSecondary">
                        A pull request already exists for this scan.
                      </Typography>
                    )}
                  {canCreatePr === false &&
                    /remediate/i.test(activity.scan_type) &&
                    (activity.patches?.length ?? 0) === 0 && (
                      <Typography variant="caption" color="textSecondary">
                        No patch output available to open as a PR.
                      </Typography>
                    )}
                  <Button
                    variant="outlined"
                    color="secondary"
                    disabled={deleting}
                    startIcon={<DeleteIcon />}
                    onClick={handleDelete}
                  >
                    {deleting ? 'Deleting…' : 'Delete activity'}
                  </Button>
                </Box>
              </Box>

              <Box mt={2}>
                <Typography variant="body2" color="textSecondary" gutterBottom>
                  Violation counts
                </Typography>
                <Typography variant="body1">
                  Total: {activity.total_violations} · Fixable:{' '}
                  {activity.fixable} · Remediated: {activity.remediated_count}
                </Typography>
              </Box>

              {prError && (
                <Box mt={2}>
                  <Typography color="error" variant="body2">
                    {prError}
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                Severity distribution
              </Typography>
              <ViolationStatusBar violations={activity.violations} />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Box
            display="flex"
            flexWrap="wrap"
            style={{ gap: 16 }}
            alignItems="center"
          >
            <FormControl
              variant="outlined"
              size="small"
              style={{ minWidth: 160 }}
            >
              <InputLabel id="sev-filter">Severity</InputLabel>
              <Select
                labelId="sev-filter"
                label="Severity"
                value={severityFilter}
                onChange={e => setSeverityFilter(e.target.value as string)}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
                <MenuItem value="error">Error</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="info">Info</MenuItem>
              </Select>
            </FormControl>
            <FormControl
              variant="outlined"
              size="small"
              style={{ minWidth: 200 }}
            >
              <InputLabel id="rule-filter">Rule</InputLabel>
              <Select
                labelId="rule-filter"
                label="Rule"
                value={ruleFilter}
                onChange={e => setRuleFilter(e.target.value as string)}
              >
                <MenuItem value="all">All rules</MenuItem>
                {ruleOptions.map(r => (
                  <MenuItem key={r} value={r}>
                    {bareRuleId(r)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              variant="outlined"
              label="Search"
              placeholder="Message, file, or rule"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
            />
            <Typography variant="body2" color="textSecondary">
              {filteredViolations.length} of {activity.violations.length} shown
            </Typography>
          </Box>
        </Grid>

        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>
            Violations
          </Typography>
          {filteredViolations.length === 0 && (
            <Typography color="textSecondary" variant="body2">
              No violations match the current filters.
            </Typography>
          )}
          {filteredViolations.map(v => {
            const color = severityColor(v.level, v.rule_id);
            const label = severityLabel(v.level, v.rule_id);
            const hasYaml =
              (v.original_yaml !== null && v.original_yaml !== undefined) ||
              (v.fixed_yaml !== null && v.fixed_yaml !== undefined);
            const hasAi = Boolean(v.ai_reason || v.ai_suggestion);
            const fileLine =
              v.line !== null && v.line !== undefined
                ? `${v.file}:${v.line}`
                : v.file;

            return (
              <Accordion key={v.id}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box
                    display="flex"
                    flexWrap="wrap"
                    alignItems="center"
                    style={{ gap: 8, width: '100%' }}
                  >
                    <Chip
                      size="small"
                      label={bareRuleId(v.rule_id)}
                      variant="outlined"
                    />
                    <Chip
                      size="small"
                      label={label}
                      style={{
                        backgroundColor: `${color}22`,
                        color,
                        border: 'none',
                      }}
                    />
                    <Typography
                      variant="body2"
                      color="textSecondary"
                      component="span"
                      style={{ fontFamily: 'monospace' }}
                    >
                      {fileLine}
                    </Typography>
                    <Typography
                      variant="body2"
                      component="span"
                      style={{ flex: 1, minWidth: 200 }}
                    >
                      {v.message}
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Box
                    display="flex"
                    flexDirection="column"
                    style={{ gap: 12, width: '100%' }}
                  >
                    {hasYaml && (
                      <Box>
                        <Typography variant="subtitle2" gutterBottom>
                          Original vs fixed (diff)
                        </Typography>
                        <Box
                          style={{
                            maxHeight: 320,
                            border: '1px solid #e0e0e0',
                            borderRadius: 4,
                            overflow: 'auto',
                          }}
                        >
                          <DiffView
                            diff={buildLineDiff(
                              v.path || v.file,
                              v.original_yaml || '',
                              v.fixed_yaml || '',
                            )}
                          />
                        </Box>
                      </Box>
                    )}
                    {hasAi && (
                      <Box>
                        {v.ai_reason && (
                          <Box mb={1}>
                            <Typography variant="subtitle2" gutterBottom>
                              AI reason
                            </Typography>
                            <Typography
                              variant="body2"
                              component="div"
                              style={{ whiteSpace: 'pre-wrap' }}
                            >
                              {v.ai_reason}
                            </Typography>
                          </Box>
                        )}
                        {v.ai_suggestion && (
                          <Box>
                            <Typography variant="subtitle2" gutterBottom>
                              AI suggestion
                            </Typography>
                            <Typography
                              variant="body2"
                              component="div"
                              style={{ whiteSpace: 'pre-wrap' }}
                            >
                              {v.ai_suggestion}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    )}
                  </Box>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Grid>

        {activity.logs && activity.logs.length > 0 && (
          <Grid item xs={12}>
            <PipelineLogOutput logs={activity.logs} />
          </Grid>
        )}

        {activity.diagnostics_json && (
          <Grid item xs={12}>
            <Card variant="outlined">
              <CardContent style={{ paddingBottom: 8 }}>
                <Box
                  display="flex"
                  alignItems="center"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setDiagnosticsOpen(!diagnosticsOpen)}
                >
                  <Typography variant="subtitle2" style={{ flex: 1 }}>
                    Diagnostics {diag.isJson ? '(JSON)' : ''}
                  </Typography>
                  <IconButton size="small">
                    {diagnosticsOpen ? (
                      <ExpandMoreIcon style={{ transform: 'rotate(180deg)' }} />
                    ) : (
                      <ExpandMoreIcon />
                    )}
                  </IconButton>
                </Box>
                <Collapse in={diagnosticsOpen}>
                  <pre
                    style={{
                      margin: '8px 0 0 0',
                      maxHeight: 400,
                      overflow: 'auto',
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    {diag.pretty}
                  </pre>
                </Collapse>
              </CardContent>
            </Card>
          </Grid>
        )}

        {activity.patches && activity.patches.length > 0 && (
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom>
              Patches
            </Typography>
            {activity.patches.map((p: PatchDetail) => (
              <Card key={p.id} variant="outlined" style={{ marginBottom: 16 }}>
                <CardContent>
                  <Typography
                    variant="subtitle2"
                    gutterBottom
                    style={{ fontFamily: 'monospace' }}
                  >
                    {p.file}
                  </Typography>
                  <Box
                    style={{
                      maxHeight: 400,
                      border: '1px solid #e0e0e0',
                      borderRadius: 4,
                      overflow: 'auto',
                    }}
                  >
                    <DiffView diff={p.diff} />
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Grid>
        )}
      </Grid>
    </>
  );
};
