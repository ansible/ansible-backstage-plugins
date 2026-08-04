import { Fragment } from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUrlToggle } from '../../hooks/useUrlToggle';
import { InfoCard, Progress } from '@backstage/core-components';
import { useApi, alertApiRef } from '@backstage/core-plugin-api';
import { usePermission } from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';
import {
  Typography,
  Button,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Collapse,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  makeStyles,
  Tooltip,
} from '@material-ui/core';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import VisibilityIcon from '@material-ui/icons/Visibility';
import DeleteIcon from '@material-ui/icons/Delete';
import ArchiveIcon from '@material-ui/icons/Archive';
import UnarchiveIcon from '@material-ui/icons/Unarchive';
import SettingsIcon from '@material-ui/icons/Settings';
import AddIcon from '@material-ui/icons/Add';
import WarningIcon from '@material-ui/icons/Warning';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import BookmarkIcon from '@material-ui/icons/Bookmark';
import BookmarkBorderIcon from '@material-ui/icons/BookmarkBorder';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import { Menu } from '@material-ui/core';
import { complianceApiRef } from '../../api';
import { formatDuration } from '../shared/formatTime';
import {
  EXECUTION_COLORS,
  PROFILE_STATUS_COLORS,
  STATUS_COLORS,
} from '../shared/colors';
import { CHIP_SIZES, TABLE_STYLES } from '../shared/chipStyles';
import { InlineBaselinePins } from './InlineBaselinePins';
import type {
  RemediationProfile,
  RemediationExecution,
  RemediationProfileStatus,
  AuthoritativeScanResponse,
  BaselineTarget,
} from '@ansible/backstage-compliance-common/types';

type StatusFilter = 'active' | 'all' | 'draft' | 'archived';

const useStyles = makeStyles(theme => ({
  emptyState: {
    textAlign: 'center',
    padding: theme.spacing(6),
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
    gap: theme.spacing(2),
  },
  filterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
  statusFilter: {
    minWidth: 140,
  },
  profileFilter: {
    minWidth: 180,
  },
  nameCell: {
    fontWeight: 500,
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(0.5),
  },
  statusChips: {
    display: 'flex',
    gap: theme.spacing(0.5),
    flexWrap: 'wrap',
  },
  statusChip: {
    ...CHIP_SIZES.standard,
  },
  expandedRow: {
    backgroundColor: theme.palette.type === 'dark' ? '#1a1a1a' : '#FAFAFA',
  },
  executionTable: {
    '& th': {
      ...TABLE_STYLES.header,
      padding: theme.spacing(0.5, 1),
    },
    '& td': {
      ...TABLE_STYLES.cell,
      padding: theme.spacing(0.5, 1),
    },
  },
  muted: {
    color: theme.palette.text.secondary,
  },
}));

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function formatAbsoluteDate(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

function formatHybridDate(iso: string): { absolute: string; relative: string } {
  return {
    absolute: formatAbsoluteDate(iso),
    relative: formatRelativeDate(iso),
  };
}

function ExecutionHistoryRow({
  execution,
  inventoryNames,
  complianceProfileId,
}: {
  execution: RemediationExecution;
  inventoryNames: Map<number, string>;
  complianceProfileId?: string;
}) {
  const classes = useStyles();
  const navigate = useNavigate();
  const execColor = EXECUTION_COLORS[execution.status];

  return (
    <TableRow>
      <TableCell>
        <Tooltip title={formatRelativeDate(execution.startedAt)}>
          <span>{formatAbsoluteDate(execution.startedAt)}</span>
        </Tooltip>
      </TableCell>
      <TableCell>
        <Chip
          label={execution.status}
          size="small"
          className={classes.statusChip}
          style={{ backgroundColor: execColor.bg, color: execColor.fg }}
        />
      </TableCell>
      <TableCell>
        <Chip
          label={
            inventoryNames.get(execution.inventoryId) ||
            `Inventory #${execution.inventoryId}`
          }
          size="small"
          variant="outlined"
          clickable
          onClick={e => {
            e.stopPropagation();
            const path = `/compliance/inventories/${execution.inventoryId}`;
            navigate(
              complianceProfileId
                ? `${path}?profileId=${complianceProfileId}`
                : path,
            );
          }}
        />
      </TableCell>
      <TableCell>
        {execution.rulesApplied !== null ? (
          <>
            {execution.rulesApplied}
            {execution.rulesFailed ? (
              <span style={{ color: STATUS_COLORS.error }}>
                {' '}
                ({execution.rulesFailed} failed)
              </span>
            ) : null}
          </>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell>
        {execution.hostsTargeted !== null ? (
          <>
            {execution.hostsTargeted}
            {execution.hostsFailed ? (
              <span style={{ color: STATUS_COLORS.error }}>
                {' '}
                ({execution.hostsFailed} failed)
              </span>
            ) : null}
          </>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell>{formatDuration(execution.elapsedSeconds)}</TableCell>
      <TableCell>
        <div className={classes.actions}>
          {execution.verificationScanId && (
            <Chip
              label="Verified"
              size="small"
              className={classes.statusChip}
              style={{
                backgroundColor: EXECUTION_COLORS.succeeded.bg,
                color: EXECUTION_COLORS.succeeded.fg,
              }}
            />
          )}
          {execution.primaryJobId && (
            <Tooltip title="View execution details">
              <IconButton
                size="small"
                onClick={() =>
                  navigate(
                    `/compliance/remediation-result/${execution.primaryJobId}`,
                  )
                }
              >
                <VisibilityIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function RowActions({
  remediation: r,
  isAdmin,
  canDelete,
  canArchive,
  baselineTargets,
  onBookmark,
  onEdit,
  onLaunch,
  onArchive,
  onDelete,
}: {
  remediation: RemediationProfile;
  isAdmin: boolean;
  canDelete: boolean;
  canArchive: boolean;
  baselineTargets: BaselineTarget[];
  onBookmark: () => void;
  onEdit: () => void;
  onLaunch: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  useEffect(
    () => () => {
      setAnchorEl(null);
    },
    [],
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Tooltip
        title={(() => {
          if (r.status === 'archived') return 'Archived — restore to launch';
          if (r.status === 'draft') return 'Save the profile before launching';
          return 'Launch remediation';
        })()}
      >
        <span>
          <IconButton
            size="small"
            disabled={r.status === 'archived' || r.status === 'draft'}
            onClick={onLaunch}
          >
            <PlayArrowIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <IconButton
        size="small"
        onClick={e => setAnchorEl(e.currentTarget)}
        aria-label="More actions"
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            onEdit();
          }}
        >
          <VisibilityIcon fontSize="small" style={{ marginRight: 8 }} /> Edit
          Selections
        </MenuItem>
        {r.status === 'saved' && (
          <MenuItem
            onClick={() => {
              setAnchorEl(null);
              onBookmark();
            }}
          >
            {baselineTargets.some(bt => bt.remediationProfileId === r.id) ? (
              <BookmarkIcon
                fontSize="small"
                style={{ marginRight: 8, color: STATUS_COLORS.info }}
              />
            ) : (
              <BookmarkBorderIcon fontSize="small" style={{ marginRight: 8 }} />
            )}
            {baselineTargets.some(bt => bt.remediationProfileId === r.id)
              ? 'Manage Baseline'
              : 'Pin as Baseline'}
          </MenuItem>
        )}
        {canArchive && isAdmin && (
          <MenuItem
            onClick={() => {
              setAnchorEl(null);
              onArchive();
            }}
          >
            {r.status === 'archived' ? (
              <>
                <UnarchiveIcon fontSize="small" style={{ marginRight: 8 }} />{' '}
                Restore
              </>
            ) : (
              <>
                <ArchiveIcon fontSize="small" style={{ marginRight: 8 }} />{' '}
                Archive
              </>
            )}
          </MenuItem>
        )}
        {isAdmin && (
          <MenuItem
            disabled={!canDelete}
            onClick={() => {
              setAnchorEl(null);
              onDelete();
            }}
            style={canDelete ? { color: STATUS_COLORS.error } : undefined}
          >
            <DeleteIcon fontSize="small" style={{ marginRight: 8 }} />
            {(() => {
              if (!canDelete)
                return (r.executionCount ?? 0) > 0
                  ? 'Delete (has history)'
                  : 'Delete (pinned)';
              return 'Delete';
            })()}
          </MenuItem>
        )}
      </Menu>
    </div>
  );
}

export const RemediationsList = () => {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useApi(complianceApiRef);
  const alertApi = useApi(alertApiRef);
  const [remediations, setRemediations] = useState<RemediationProfile[]>([]);
  const [profileNames, setProfileNames] = useState<Map<string, string>>(
    new Map(),
  );
  const [inventoryNames, setInventoryNames] = useState<Map<number, string>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useUrlToggle<StatusFilter>(
    'statusFilter',
    'active',
  );
  const [expandedProfiles, setExpandedProfiles] = useState<Set<string>>(
    new Set(),
  );
  const [executionHistory, setExecutionHistory] = useState<
    Map<string, RemediationExecution[]>
  >(new Map());
  const [deleteTarget, setDeleteTarget] = useState<RemediationProfile | null>(
    null,
  );
  const [archiveTarget, setArchiveTarget] = useState<RemediationProfile | null>(
    null,
  );
  const [actionInProgress, setActionInProgress] = useState(false);

  // Baseline pinning state
  const [baselineTargets, setBaselineTargets] = useState<BaselineTarget[]>([]);
  const inventorySectionRefs = useRef<Map<string, HTMLDivElement | null>>(
    new Map(),
  );

  // Launch dialog state (ADR-015)
  const [launchTarget, setLaunchTarget] = useState<RemediationProfile | null>(
    null,
  );
  const [launchInventoryId, setLaunchInventoryId] = useState<string>('');
  const [launchScanCheck, setLaunchScanCheck] =
    useState<AuthoritativeScanResponse | null>(null);
  const [launchScanChecking, setLaunchScanChecking] = useState(false);
  const [launchScanMissing, setLaunchScanMissing] = useState(false);
  const [inventories, setInventories] = useState<
    Array<{ id: number; name: string; hostCount: number }>
  >([]);

  // Cross-profile filtering (ADR-015 §5)
  const [searchParams, setSearchParams] = useSearchParams();
  const filterByProfile = searchParams.get('complianceProfileId');

  const { allowed: isAdmin } = usePermission({
    permission: catalogEntityCreatePermission,
  });

  const loadProfiles = useCallback(async () => {
    try {
      const backendFilter: RemediationProfileStatus | 'all' | undefined =
        statusFilter === 'active' ? undefined : statusFilter;

      const [data, profiles, inventoryData, baselines] = await Promise.all([
        api.getRemediationProfiles(backendFilter),
        api.getRegisteredProfiles().catch(() => []),
        api.getInventories().catch(() => []),
        api.getBaselineTargets().catch(() => [] as BaselineTarget[]),
      ]);

      const filtered = filterByProfile
        ? data.filter(r => r.complianceProfileId === filterByProfile)
        : data;
      setRemediations(filtered);
      setProfileNames(new Map(profiles.map(c => [c.id, c.displayName])));
      setInventoryNames(new Map(inventoryData.map(inv => [inv.id, inv.name])));
      setInventories(inventoryData);
      setBaselineTargets(baselines);
      setExecutionHistory(new Map());
      setExpandedProfiles(new Set());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alertApi.post({
        message: `Failed to load remediations: ${msg}`,
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [api, alertApi, statusFilter, filterByProfile]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // Check for authoritative scan when launch dialog inventory changes
  useEffect(() => {
    if (!launchTarget || !launchInventoryId) {
      setLaunchScanCheck(null);
      setLaunchScanMissing(false);
      return undefined;
    }
    let cancelled = false;
    setLaunchScanChecking(true);
    setLaunchScanCheck(null);
    setLaunchScanMissing(false);
    api
      .getAuthoritativeScan(
        launchTarget.complianceProfileId,
        Number(launchInventoryId),
      )
      .then(result => {
        if (cancelled) return;
        if (result) {
          setLaunchScanCheck(result);
          setLaunchScanMissing(false);
        } else {
          setLaunchScanCheck(null);
          setLaunchScanMissing(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLaunchScanMissing(true);
      })
      .finally(() => {
        if (!cancelled) setLaunchScanChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, launchTarget, launchInventoryId]);

  const toggleExpanded = async (profileId: string) => {
    const next = new Set(expandedProfiles);
    if (next.has(profileId)) {
      next.delete(profileId);
    } else {
      next.add(profileId);
      if (!executionHistory.has(profileId)) {
        try {
          const execs = await api.getRemediationExecutions(profileId, 10);
          setExecutionHistory(prev => new Map(prev).set(profileId, execs));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          alertApi.post({
            message: `Failed to load execution history: ${msg}`,
            severity: 'error',
          });
        }
      }
    }
    setExpandedProfiles(next);
  };

  const handleBookmarkClick = async (profileId: string) => {
    if (!expandedProfiles.has(profileId)) {
      await toggleExpanded(profileId);
    }
    setTimeout(() => {
      const el = inventorySectionRefs.current.get(profileId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 350);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionInProgress(true);
    try {
      await api.deleteRemediationProfile(deleteTarget.id);
      setRemediations(prev => prev.filter(r => r.id !== deleteTarget.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alertApi.post({ message: `Failed to delete: ${msg}`, severity: 'error' });
    } finally {
      setActionInProgress(false);
      setDeleteTarget(null);
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setActionInProgress(true);
    try {
      const newStatus =
        archiveTarget.status === 'archived' ? 'saved' : 'archived';
      await api.updateRemediationProfileStatus(
        archiveTarget.id,
        newStatus as RemediationProfileStatus,
      );
      const shouldRemoveFromView =
        (statusFilter === 'active' && newStatus === 'archived') ||
        (statusFilter === 'archived' && newStatus === 'saved');
      if (shouldRemoveFromView) {
        setRemediations(prev => prev.filter(r => r.id !== archiveTarget.id));
      } else {
        setRemediations(prev =>
          prev.map(r =>
            r.id === archiveTarget.id
              ? { ...r, status: newStatus as RemediationProfileStatus }
              : r,
          ),
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('409')) {
        alertApi.post({
          message:
            'This profile is pinned as a baseline. Unpin it from the Compliance Posture > By Inventory view before archiving.',
          severity: 'warning',
        });
      } else {
        alertApi.post({
          message: `Failed to update status: ${msg}`,
          severity: 'error',
        });
      }
    } finally {
      setActionInProgress(false);
      setArchiveTarget(null);
    }
  };

  if (loading) return <Progress />;

  return (
    <InfoCard title="Remediations">
      <div className={classes.headerRow}>
        <Typography variant="body2" color="textSecondary">
          Saved remediation profiles capture your rule selections. Launch them
          against any inventory.
        </Typography>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => navigate('/compliance/scan')}
        >
          New Scan
        </Button>
      </div>

      <div className={classes.filterRow}>
        <FormControl
          variant="outlined"
          size="small"
          className={classes.statusFilter}
        >
          <InputLabel id="status-filter-label">Status</InputLabel>
          <Select
            labelId="status-filter-label"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            label="Status"
          >
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="draft">Drafts</MenuItem>
            <MenuItem value="archived">Archived</MenuItem>
          </Select>
        </FormControl>
        <FormControl
          variant="outlined"
          size="small"
          className={classes.profileFilter}
        >
          <InputLabel id="profile-filter-label">Profile</InputLabel>
          <Select
            labelId="profile-filter-label"
            value={filterByProfile || ''}
            onChange={e => {
              const val = e.target.value as string;
              const next = new URLSearchParams(searchParams);
              if (val) {
                next.set('complianceProfileId', val);
              } else {
                next.delete('complianceProfileId');
              }
              setSearchParams(next);
            }}
            label="Profile"
          >
            <MenuItem value="">All Profiles</MenuItem>
            {Array.from(profileNames.entries()).map(([id, name]) => (
              <MenuItem key={id} value={id}>
                {name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="caption" className={classes.muted}>
          {remediations.length} profile{remediations.length !== 1 ? 's' : ''}
        </Typography>
      </div>

      {remediations.length === 0 ? (
        <div className={classes.emptyState}>
          <SettingsIcon
            style={{
              fontSize: 64,
              color: STATUS_COLORS.neutral,
              marginBottom: 16,
            }}
          />
          <Typography variant="h6" color="textSecondary" gutterBottom>
            {(() => {
              if (statusFilter === 'active') return 'No active remediations';
              if (statusFilter === 'draft') return 'No drafts';
              if (statusFilter === 'archived')
                return 'No archived remediations';
              return 'No remediations';
            })()}
          </Typography>
          <Typography variant="body2" color="textSecondary" paragraph>
            Run a compliance scan, review the findings, then save your rule
            selections as a remediation profile.
          </Typography>
          {statusFilter === 'active' && (
            <Button
              variant="contained"
              color="primary"
              onClick={() => navigate('/compliance/scan')}
            >
              Launch a Scan
            </Button>
          )}
        </div>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" style={TABLE_STYLES.header} />
                <TableCell style={TABLE_STYLES.header}>Name</TableCell>
                <TableCell style={TABLE_STYLES.header}>Status</TableCell>
                <TableCell style={TABLE_STYLES.header}>Profile</TableCell>
                <TableCell style={TABLE_STYLES.header} align="right">
                  Rules
                </TableCell>
                <TableCell style={TABLE_STYLES.header}>Last Run</TableCell>
                <TableCell style={TABLE_STYLES.header} align="right">
                  Runs
                </TableCell>
                <TableCell style={TABLE_STYLES.header} />
              </TableRow>
            </TableHead>
            <TableBody>
              {remediations.map(r => {
                const isExpanded = expandedProfiles.has(r.id);
                const hasExecutions = (r.executionCount ?? 0) > 0;
                const profileColor = PROFILE_STATUS_COLORS[r.status || 'saved'];
                const latestExec = r.latestExecution;
                const isPinned = baselineTargets.some(
                  bt => bt.remediationProfileId === r.id,
                );
                const canDelete = !hasExecutions && !isPinned;
                const canArchive =
                  r.status === 'saved' || r.status === 'archived';

                return (
                  <Fragment key={r.id}>
                    <TableRow hover>
                      <TableCell padding="checkbox">
                        {(hasExecutions || r.status === 'saved') && (
                          <IconButton
                            size="small"
                            data-testid={`expand-${r.id}`}
                            onClick={() => toggleExpanded(r.id)}
                          >
                            {isExpanded ? (
                              <ExpandLessIcon fontSize="small" />
                            ) : (
                              <ExpandMoreIcon fontSize="small" />
                            )}
                          </IconButton>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          className={classes.nameCell}
                        >
                          {r.name}
                        </Typography>
                        {r.description && (
                          <Typography variant="caption" color="textSecondary">
                            {r.description}
                          </Typography>
                        )}
                        {(() => {
                          const pins = baselineTargets.filter(
                            bt => bt.remediationProfileId === r.id,
                          );
                          if (pins.length === 0) return null;
                          return (
                            <Box
                              display="flex"
                              alignItems="center"
                              mt={0.5}
                              style={{ gap: 4 }}
                            >
                              <Chip
                                icon={<BookmarkIcon style={{ fontSize: 14 }} />}
                                label={`${pins.length} pinned`}
                                size="small"
                                className={classes.statusChip}
                                style={{
                                  backgroundColor: EXECUTION_COLORS.running.bg,
                                  color: EXECUTION_COLORS.running.fg,
                                  cursor: 'pointer',
                                }}
                                onClick={e => {
                                  e.stopPropagation();
                                  handleBookmarkClick(r.id);
                                }}
                              />
                            </Box>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className={classes.statusChips}>
                          <Chip
                            label={r.status || 'saved'}
                            size="small"
                            className={classes.statusChip}
                            style={{
                              backgroundColor: profileColor.bg,
                              color: profileColor.fg,
                            }}
                          />
                          {latestExec && (
                            <Chip
                              label={`${latestExec.status} · ${
                                inventoryNames.get(latestExec.inventoryId) ||
                                `#${latestExec.inventoryId}`
                              }`}
                              size="small"
                              className={classes.statusChip}
                              style={{
                                backgroundColor:
                                  EXECUTION_COLORS[latestExec.status].bg,
                                color: EXECUTION_COLORS[latestExec.status].fg,
                              }}
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={
                            profileNames.get(r.complianceProfileId) ||
                            r.complianceProfileId
                          }
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">
                        {r.selections.filter(s => s.enabled).length}
                      </TableCell>
                      <TableCell>
                        {r.lastExecutedAt ? (
                          (() => {
                            const { absolute, relative } = formatHybridDate(
                              r.lastExecutedAt,
                            );
                            return (
                              <Tooltip title={relative}>
                                <Typography
                                  variant="body2"
                                  style={{ whiteSpace: 'nowrap' }}
                                >
                                  {absolute}
                                </Typography>
                              </Tooltip>
                            );
                          })()
                        ) : (
                          <span className={classes.muted}>Never</span>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {r.executionCount ?? 0}
                      </TableCell>
                      <TableCell>
                        <RowActions
                          remediation={r}
                          isAdmin={isAdmin}
                          canDelete={canDelete}
                          canArchive={canArchive}
                          baselineTargets={baselineTargets}
                          onBookmark={() => handleBookmarkClick(r.id)}
                          onEdit={() =>
                            navigate(`/compliance/remediation-edit/${r.id}`)
                          }
                          onLaunch={() => {
                            setLaunchTarget(r);
                            setLaunchInventoryId('');
                            setLaunchScanCheck(null);
                            setLaunchScanMissing(false);
                          }}
                          onArchive={() => setArchiveTarget(r)}
                          onDelete={() => setDeleteTarget(r)}
                        />
                      </TableCell>
                    </TableRow>
                    {(hasExecutions || r.status === 'saved') && (
                      <TableRow>
                        <TableCell style={{ padding: 0 }} colSpan={8}>
                          <Collapse
                            in={isExpanded}
                            timeout="auto"
                            unmountOnExit
                          >
                            <Box px={2} py={1} className={classes.expandedRow}>
                              {hasExecutions && (
                                <>
                                  <Typography variant="subtitle2" gutterBottom>
                                    Execution History
                                  </Typography>
                                  <Table
                                    size="small"
                                    className={classes.executionTable}
                                  >
                                    <TableHead>
                                      <TableRow>
                                        <TableCell>When</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Inventory</TableCell>
                                        <TableCell>Rules</TableCell>
                                        <TableCell>Hosts</TableCell>
                                        <TableCell>Duration</TableCell>
                                        <TableCell />
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {(executionHistory.get(r.id) || []).map(
                                        exec => (
                                          <ExecutionHistoryRow
                                            key={exec.id}
                                            execution={exec}
                                            inventoryNames={inventoryNames}
                                            complianceProfileId={
                                              r.complianceProfileId
                                            }
                                          />
                                        ),
                                      )}
                                      {!executionHistory.has(r.id) && (
                                        <TableRow>
                                          <TableCell colSpan={7}>
                                            <Typography
                                              variant="caption"
                                              className={classes.muted}
                                            >
                                              Loading...
                                            </Typography>
                                          </TableCell>
                                        </TableRow>
                                      )}
                                    </TableBody>
                                  </Table>
                                </>
                              )}
                              {r.status === 'saved' && (
                                <div
                                  ref={el =>
                                    inventorySectionRefs.current.set(r.id, el)
                                  }
                                  style={
                                    hasExecutions
                                      ? {
                                          marginTop: 16,
                                          borderTop:
                                            '1px solid rgba(0,0,0,0.12)',
                                          paddingTop: 12,
                                        }
                                      : undefined
                                  }
                                >
                                  <InlineBaselinePins
                                    remediationProfileId={r.id}
                                    complianceProfileId={r.complianceProfileId}
                                    inventories={inventories}
                                    currentPins={baselineTargets}
                                    onChanged={loadProfiles}
                                  />
                                </div>
                              )}
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Launch remediation dialog (ADR-015) */}
      <Dialog
        open={!!launchTarget}
        onClose={() => setLaunchTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Launch Remediation</DialogTitle>
        <DialogContent>
          <Box mb={2}>
            <Typography variant="body2" color="textSecondary">
              Profile: <strong>{launchTarget?.name}</strong>
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Standard:{' '}
              {profileNames.get(launchTarget?.complianceProfileId ?? '') ||
                launchTarget?.complianceProfileId}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Rules: {launchTarget?.selections.filter(s => s.enabled).length}{' '}
              selected
            </Typography>
          </Box>

          <FormControl
            variant="outlined"
            fullWidth
            style={{ marginBottom: 16 }}
          >
            <InputLabel id="launch-inventory-label">
              Target Inventory
            </InputLabel>
            <Select
              labelId="launch-inventory-label"
              value={launchInventoryId}
              onChange={e => setLaunchInventoryId(e.target.value as string)}
              label="Target Inventory"
            >
              {inventories.map(inv => (
                <MenuItem key={inv.id} value={inv.id.toString()}>
                  {inv.name} ({inv.hostCount} hosts)
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {launchScanChecking && (
            <Box display="flex" alignItems="center" style={{ gap: 8 }}>
              <Progress />
              <Typography variant="body2" color="textSecondary">
                Checking for assessment scan...
              </Typography>
            </Box>
          )}

          {launchScanCheck && (
            <Box
              display="flex"
              alignItems="center"
              style={{ gap: 8, color: STATUS_COLORS.success }}
            >
              <CheckCircleIcon fontSize="small" />
              <Typography variant="body2">
                Last scan: {launchScanCheck.passRate}% pass rate (
                {launchScanCheck.passCount} pass, {launchScanCheck.failCount}{' '}
                fail)
                {launchScanCheck.scan.completedAt && (
                  <span style={{ color: STATUS_COLORS.neutral }}>
                    {' '}
                    —{' '}
                    {new Date(
                      launchScanCheck.scan.completedAt,
                    ).toLocaleDateString()}
                  </span>
                )}
              </Typography>
            </Box>
          )}

          {launchScanMissing && (
            <Box>
              <Box
                display="flex"
                alignItems="center"
                style={{ gap: 8, color: STATUS_COLORS.error, marginBottom: 8 }}
              >
                <WarningIcon fontSize="small" />
                <Typography variant="body2">
                  No completed assessment scan found for this inventory.
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  const params = new URLSearchParams();
                  if (launchTarget?.complianceProfileId)
                    params.set('profile', launchTarget.complianceProfileId);
                  if (launchInventoryId)
                    params.set('inventory', launchInventoryId);
                  setLaunchTarget(null);
                  navigate(`/compliance/scan?${params.toString()}`);
                }}
              >
                Run a Scan First
              </Button>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLaunchTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            disabled={!launchScanCheck || launchScanChecking}
            startIcon={<PlayArrowIcon />}
            onClick={() => {
              if (!launchTarget || !launchScanCheck) return;
              const params = new URLSearchParams();
              params.set('profileId', launchTarget.id);
              params.set('inventoryId', launchInventoryId);
              params.set('scanId', launchScanCheck.scan.id);
              setLaunchTarget(null);
              navigate(`/compliance/execute/launch?${params.toString()}`);
            }}
          >
            Launch Remediation
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Delete {deleteTarget?.status === 'draft' ? 'Draft' : 'Profile'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteTarget(null)}
            disabled={actionInProgress}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleDelete}
            disabled={actionInProgress}
          >
            {actionInProgress ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Archive/Restore confirmation dialog */}
      <Dialog
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {archiveTarget?.status === 'archived'
            ? 'Restore Profile'
            : 'Archive Profile'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {archiveTarget?.status === 'archived' ? (
              <>
                Restore <strong>{archiveTarget?.name}</strong> to active
                remediations?
              </>
            ) : (
              <>
                Archive <strong>{archiveTarget?.name}</strong>? It will be
                hidden from the default view but can be restored later.
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setArchiveTarget(null)}
            disabled={actionInProgress}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleArchive}
            disabled={actionInProgress}
          >
            {(() => {
              if (actionInProgress) return 'Processing...';
              if (archiveTarget?.status === 'archived') return 'Restore';
              return 'Archive';
            })()}
          </Button>
        </DialogActions>
      </Dialog>
    </InfoCard>
  );
};
