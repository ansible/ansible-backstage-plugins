import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Breadcrumbs, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { usePermission } from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';
import {
  Typography,
  Button,
  Chip,
  Box,
  Collapse,
  IconButton,
  TextField,
  Divider,
  makeStyles,
  ButtonGroup,
  Tooltip,
} from '@material-ui/core';
import SettingsIcon from '@material-ui/icons/Settings';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import WarningIcon from '@material-ui/icons/Warning';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import SaveIcon from '@material-ui/icons/Save';
import type {
  FindingSeverity,
  FindingState,
  MultiHostFinding,
  RemediationProfile,
} from '@ansible/backstage-compliance-common/types';
import { complianceApiRef } from '../../api';
import { FilterGroup } from '../ResultsViewer/FilterGroup';
import type { FilterOption } from '../ResultsViewer/FilterGroup';
import { SEVERITY_COLORS, STATUS_COLORS } from '../shared/colors';
import { VirtualizedFindingsList } from './VirtualizedFindingsList';
import type { ListItem } from './VirtualizedFindingsList';
import type { RuleSelection } from './FindingCard';

// ─── Filter definitions (consistent with ResultsViewer) ─────────────
const SEVERITY_OPTIONS: FilterOption[] = [
  { key: 'CAT_I', label: 'CAT I', color: SEVERITY_COLORS.CAT_I },
  { key: 'CAT_II', label: 'CAT II', color: SEVERITY_COLORS.CAT_II },
  { key: 'CAT_III', label: 'CAT III', color: SEVERITY_COLORS.CAT_III },
];
const STATE_OPTIONS: FilterOption[] = [
  { key: 'new', label: 'New', color: STATUS_COLORS.info },
  { key: 'fixed', label: 'Fixed', color: STATUS_COLORS.success },
  { key: 'resurfaced', label: 'Resurfaced', color: STATUS_COLORS.error },
  { key: 'active', label: 'Active', color: STATUS_COLORS.neutral },
];
const RISK_OPTIONS: FilterOption[] = [
  {
    key: 'disruption:high',
    label: 'High Disruption',
    color: STATUS_COLORS.error,
  },
  { key: 'aap:caution', label: 'AAP Caution', color: STATUS_COLORS.warning },
  {
    key: 'aap:breaks-connectivity',
    label: 'Breaks AAP',
    color: STATUS_COLORS.error,
  },
];

const useStyles = makeStyles(theme => ({
  findingCard: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    marginBottom: theme.spacing(1),
    overflow: 'hidden',
  },
  findingHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: theme.spacing(1.5, 2),
    gap: theme.spacing(1.5),
  },
  findingDisabled: {
    opacity: 0.5,
    backgroundColor: theme.palette.action.disabledBackground,
  },
  findingEnabled: { backgroundColor: theme.palette.background.paper },
  severityChip: { fontWeight: 600, minWidth: 60 },
  catI: { backgroundColor: SEVERITY_COLORS.CAT_I, color: '#fff' },
  catII: { backgroundColor: SEVERITY_COLORS.CAT_II, color: '#fff' },
  catIII: { backgroundColor: SEVERITY_COLORS.CAT_III, color: '#fff' },
  detailPanel: {
    padding: theme.spacing(2, 3),
    backgroundColor: theme.palette.background.default,
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  summaryBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.default,
    borderRadius: theme.shape.borderRadius,
    marginBottom: theme.spacing(2),
    flexWrap: 'wrap' as const,
    gap: theme.spacing(1),
  },
  summaryCount: {
    display: 'flex',
    gap: theme.spacing(3),
    flexWrap: 'wrap' as const,
  },
  bulkActions: {
    display: 'flex',
    gap: theme.spacing(1),
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(1.5, 2),
    backgroundColor: theme.palette.action.hover,
    borderRadius: theme.shape.borderRadius,
    marginBottom: theme.spacing(1),
    marginTop: theme.spacing(2),
    cursor: 'pointer',
  },
  titleGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    minWidth: 0,
  },
  hostBreakdown: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    fontSize: '0.8rem',
    color: theme.palette.text.secondary,
  },
  adviceBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1),
    padding: theme.spacing(1.5, 2),
    backgroundColor: '#FFF3CD',
    borderRadius: theme.shape.borderRadius,
    marginBottom: theme.spacing(1.5),
    border: '1px solid #FFECB5',
  },
  adviceIcon: { color: '#856404', marginTop: 2 },
  remediationStrategy: { padding: theme.spacing(1.5, 0) },
  profileHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(2),
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.default,
    borderRadius: theme.shape.borderRadius,
    marginBottom: theme.spacing(2),
    border: `1px solid ${theme.palette.divider}`,
  },
  autoSaveIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    minWidth: 80,
    flexShrink: 0,
  },
  savedIcon: { fontSize: 14, color: STATUS_COLORS.success },
  viewToggle: { marginRight: theme.spacing(2) },
  viewToggleActive: { fontWeight: 600 },
  passingNote: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(1, 2),
    marginBottom: theme.spacing(1),
    color: theme.palette.text.secondary,
    fontSize: '0.85rem',
  },
  passingNoteIcon: { color: STATUS_COLORS.success, fontSize: 18 },
  filterBar: {
    display: 'flex',
    gap: theme.spacing(1),
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    marginBottom: theme.spacing(1),
    [theme.breakpoints.down('md')]: {
      '& > :first-child': { flex: '1 1 100%' },
    },
  },
  selectionActions: {
    display: 'flex',
    gap: theme.spacing(1),
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  },
}));

type ViewMode = 'status' | 'category';
type RemediationScope = 'failed_only' | 'standardize_all';
type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const severityLabel: Record<FindingSeverity, string> = {
  CAT_I: 'CAT I — Critical',
  CAT_II: 'CAT II — Medium',
  CAT_III: 'CAT III — Low',
};

export const RemediationProfileBuilder = () => {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useApi(complianceApiRef);
  const { jobId, remediationId } = useParams<{
    jobId?: string;
    remediationId?: string;
  }>();
  const [searchParams] = useSearchParams();
  const isEditMode = !!remediationId;
  const isApplyMode = isEditMode && searchParams.get('apply') === 'true';
  const [editProfile, setEditProfile] = useState<RemediationProfile | null>(
    null,
  );
  const { allowed: canRemediate } = usePermission({
    permission: catalogEntityCreatePermission,
  });

  const [profileName, setProfileName] = useState('');
  const [profileDescription, setProfileDescription] = useState('');
  const [launching, setLaunching] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedProfileId, setSavedProfileId] = useState<string | undefined>(
    undefined,
  );
  const [profileSaved, setProfileSaved] = useState(false);
  const [allFindings, setAllFindings] = useState<MultiHostFinding[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('status');
  const [severityFilter, setSeverityFilter] = useState<'all' | FindingSeverity>(
    'all',
  );
  const [stateFilter, setStateFilter] = useState<'all' | FindingState>('all');
  const [passingRulesExpanded, setPassingRulesExpanded] = useState(false);
  const [reviewMode, setReviewMode] = useState(isEditMode);
  const [disruptionFilter, setDisruptionFilter] = useState<string>('all');
  const [aapFilter, setAapFilter] = useState<string>('all');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditMode || !remediationId) return undefined;
    let cancelled = false;
    api
      .getRemediationProfile(remediationId)
      .then(profile => {
        if (cancelled || !profile) {
          if (!cancelled) setLoading(false);
          return undefined;
        }
        setEditProfile(profile);
        setProfileName(profile.name);
        setProfileDescription(profile.description);
        setSavedProfileId(profile.id);
        if (profile.complianceProfileId) {
          api
            .getRegisteredProfiles()
            .then(rps => {
              const cp = rps.find(p => p.id === profile.complianceProfileId);
              // eslint-disable-next-line @typescript-eslint/no-use-before-define
              if (cp) setContextProfileName(cp.displayName);
            })
            .catch(() => {});
        }
        const scanIdToUse = profile.creationScanId || undefined;
        return (
          scanIdToUse ? api.getFindings(scanIdToUse) : api.getFindings()
        ).then(findings => ({ findings: findings ?? [], profile }));
      })
      .then(result => {
        if (!cancelled && result) {
          const { findings, profile: prof } = result;
          const findingIds = new Set(findings.map(f => f.ruleId));
          const stubs: MultiHostFinding[] = (prof.selections ?? [])
            .filter(s => !findingIds.has(s.ruleId))
            .map(s => ({
              ruleId: s.ruleId,
              stigId: s.ruleId,
              title: s.ruleId,
              description: '',
              fixText: '',
              checkText: '',
              severity: 'CAT_II' as const,
              category: '',
              disruption: 'low' as const,
              aapImpact: 'safe' as const,
              aapImpactReason: '',
              parameters: [],
              hosts: [],
              passCount: 0,
              failCount: 0,
              naCount: 0,
              totalCount: 0,
              automationAvailable: true,
            }));
          setAllFindings([...findings, ...stubs]);
        }
      })
      .catch(err => {
        // eslint-disable-next-line no-console
        console.error('Failed to load remediation profile for editing:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, isEditMode, remediationId]);

  const [resolvedProfileId, setResolvedProfileId] = useState<string>('');
  const [contextProfileName, setContextProfileName] = useState('');
  const [contextInventoryName, setContextInventoryName] = useState('');

  useEffect(() => {
    if (isEditMode) return undefined;
    let cancelled = false;
    Promise.all([
      api.getFindings(jobId),
      api.getRegisteredProfiles().catch(() => []),
      api.getScans().catch(() => []),
      api.getInventories().catch(() => []),
    ])
      .then(([data, profiles, scans, inventories]) => {
        if (cancelled) return;
        setAllFindings(data);
        if (profiles.length > 0) {
          const scan = scans.find(
            s => s.id === jobId || String(s.workflowJobId) === jobId,
          );
          const matchedProfile = scan
            ? profiles.find(p => p.id === scan.profileId)
            : undefined;
          setResolvedProfileId(matchedProfile?.id ?? profiles[0].id);
          if (matchedProfile) setContextProfileName(matchedProfile.displayName);
          if (scan) {
            const inv = inventories.find(i => i.id === scan.inventoryId);
            if (inv) setContextInventoryName(inv.name);
          }
        }
      })
      .catch(err => {
        // eslint-disable-next-line no-console
        console.error('Failed to load findings:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, jobId, isEditMode]);

  const [selections, setSelections] = useState<Record<string, RuleSelection>>(
    {},
  );

  useEffect(() => {
    if (allFindings.length === 0) return;
    setSelections(prev => {
      if (Object.keys(prev).length > 0) return prev;
      const savedSelections = editProfile?.selections ?? [];
      const savedMap = new Map(savedSelections.map(s => [s.ruleId, s]));
      const initial: Record<string, RuleSelection> = {};
      allFindings.forEach(f => {
        const saved = savedMap.get(f.ruleId);
        const isFailed = f.failCount > 0;
        initial[f.ruleId] = {
          enabled: (() => {
            if (saved) return saved.enabled;
            if (isFailed)
              return isEditMode
                ? false
                : f.disruption !== 'high' &&
                    f.aapImpact !== 'breaks-connectivity';
            return false;
          })(),
          expanded: false,
          scope: (saved?.scope as RemediationScope) ?? 'failed_only',
          parameters: saved?.parameters
            ? {
                ...Object.fromEntries(
                  f.parameters.map(p => [p.name, p.default]),
                ),
                ...saved.parameters,
              }
            : Object.fromEntries(f.parameters.map(p => [p.name, p.default])),
        };
      });
      return initial;
    });
  }, [allFindings, editProfile, isEditMode]);

  const toggleFinding = useCallback((ruleId: string) => {
    setSelections(prev => ({
      ...prev,
      [ruleId]: { ...prev[ruleId], enabled: !prev[ruleId].enabled },
    }));
  }, []);
  const toggleExpanded = useCallback((ruleId: string) => {
    setSelections(prev => ({
      ...prev,
      [ruleId]: { ...prev[ruleId], expanded: !prev[ruleId].expanded },
    }));
  }, []);
  const setScope = useCallback((ruleId: string, scope: RemediationScope) => {
    setSelections(prev => ({ ...prev, [ruleId]: { ...prev[ruleId], scope } }));
  }, []);
  const updateParameter = useCallback(
    (ruleId: string, paramName: string, value: string | number | boolean) => {
      setSelections(prev => ({
        ...prev,
        [ruleId]: {
          ...prev[ruleId],
          parameters: { ...prev[ruleId].parameters, [paramName]: value },
        },
      }));
    },
    [],
  );
  // ─── Risk filter: merges disruption + aap into a single group ──
  const riskActiveValue = useMemo(() => {
    if (disruptionFilter !== 'all') return `disruption:${disruptionFilter}`;
    if (aapFilter !== 'all') return `aap:${aapFilter}`;
    return 'all';
  }, [disruptionFilter, aapFilter]);

  const handleRiskSelect = useCallback((key: string) => {
    if (key === 'all') {
      setDisruptionFilter('all');
      setAapFilter('all');
      return;
    }
    const [kind, value] = key.split(':');
    if (kind === 'disruption') {
      setAapFilter('all');
      setDisruptionFilter(value);
    } else {
      setDisruptionFilter('all');
      setAapFilter(value);
    }
  }, []);

  const handleGroupToggle = (group: string) => {
    setExpandedGroup(prev => (prev === group ? null : group));
  };

  const clearFilters = () => {
    setSeverityFilter('all');
    setStateFilter('all');
    setDisruptionFilter('all');
    setAapFilter('all');
  };

  const activeFilterCount = [
    severityFilter,
    stateFilter,
    disruptionFilter,
    aapFilter,
  ].filter(f => f !== 'all').length;

  // Filtered findings based on search query
  const filteredFindings = useMemo(() => {
    if (!searchQuery) return allFindings;
    const q = searchQuery.toLowerCase();
    return allFindings.filter(
      f =>
        f.title.toLowerCase().includes(q) ||
        f.ruleId.toLowerCase().includes(q) ||
        f.stigId?.toLowerCase().includes(q) ||
        f.description?.toLowerCase().includes(q) ||
        f.category?.toLowerCase().includes(q),
    );
  }, [allFindings, searchQuery]);

  const displayFindings = useMemo(() => {
    let result = searchQuery ? filteredFindings : allFindings;
    if (severityFilter !== 'all') {
      result = result.filter(f => f.severity === severityFilter);
    }
    if (stateFilter !== 'all') {
      result = result.filter(
        f => f.stateSummary && (f.stateSummary[stateFilter] ?? 0) > 0,
      );
    }
    if (disruptionFilter !== 'all') {
      result = result.filter(f => f.disruption === disruptionFilter);
    }
    if (aapFilter !== 'all') {
      result = result.filter(f => f.aapImpact === aapFilter);
    }
    if (reviewMode) {
      result = result.filter(f => selections[f.ruleId]?.enabled);
    }
    return result;
  }, [
    filteredFindings,
    allFindings,
    searchQuery,
    severityFilter,
    stateFilter,
    disruptionFilter,
    aapFilter,
    reviewMode,
    selections,
  ]);
  const failedFindings = useMemo(
    () => displayFindings.filter(f => f.failCount > 0),
    [displayFindings],
  );
  const passingFindings = useMemo(
    () => displayFindings.filter(f => f.failCount === 0),
    [displayFindings],
  );

  const selectAllFailed = () => {
    setSelections(prev => {
      const updated = { ...prev };
      allFindings.forEach(f => {
        if (f.failCount > 0 && f.automationAvailable !== false) {
          updated[f.ruleId] = { ...updated[f.ruleId], enabled: true };
        }
      });
      return updated;
    });
  };
  const clearAll = () => {
    setSelections(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(k => {
        updated[k] = { ...updated[k], enabled: false };
      });
      return updated;
    });
  };
  const selectDisplayed = () => {
    setSelections(prev => {
      const updated = { ...prev };
      displayFindings.forEach(f => {
        if (f.automationAvailable !== false) {
          updated[f.ruleId] = { ...updated[f.ruleId], enabled: true };
        }
      });
      return updated;
    });
  };
  const deselectDisplayed = () => {
    setSelections(prev => {
      const updated = { ...prev };
      displayFindings.forEach(f => {
        updated[f.ruleId] = { ...updated[f.ruleId], enabled: false };
      });
      return updated;
    });
  };
  const selectSafeOnly = () => {
    setSelections(prev => {
      const updated = { ...prev };
      allFindings.forEach(f => {
        if (
          f.failCount > 0 &&
          f.aapImpact !== 'breaks-connectivity' &&
          f.automationAvailable !== false
        ) {
          updated[f.ruleId] = { ...updated[f.ruleId], enabled: true };
        } else {
          updated[f.ruleId] = { ...updated[f.ruleId], enabled: false };
        }
      });
      return updated;
    });
  };
  const setScopeAll = (scope: RemediationScope) => {
    setSelections(prev => {
      const updated = { ...prev };
      allFindings.forEach(f => {
        if (f.failCount > 0) {
          updated[f.ruleId] = { ...updated[f.ruleId], scope };
        }
      });
      return updated;
    });
  };
  const dominantScope = useMemo(() => {
    const scopes = allFindings
      .filter(f => f.failCount > 0)
      .map(f => selections[f.ruleId]?.scope ?? 'failed_only');
    if (scopes.length === 0) return null;
    if (scopes.every(s => s === 'standardize_all')) return 'standardize_all';
    if (scopes.every(s => s === 'failed_only')) return 'failed_only';
    return null;
  }, [allFindings, selections]);

  const enabledCount = Object.values(selections).filter(s => s.enabled).length;
  const disabledCount = Object.values(selections).filter(
    s => !s.enabled,
  ).length;
  const totalAffectedHosts = useMemo(() => {
    const hostSet = new Set<string>();
    allFindings.forEach(f => {
      const sel = selections[f.ruleId];
      if (sel?.enabled) {
        const failedHosts = f.hosts.filter(h => h.status === 'fail');
        if (sel.scope === 'standardize_all' || failedHosts.length === 0) {
          f.hosts.forEach(h => hostSet.add(h.host));
        } else {
          failedHosts.forEach(h => hostSet.add(h.host));
        }
      }
    });
    return hostSet.size;
  }, [allFindings, selections]);
  const groupedBySeverity = useMemo(() => {
    const groups: Record<FindingSeverity, MultiHostFinding[]> = {
      CAT_I: [],
      CAT_II: [],
      CAT_III: [],
    };
    displayFindings.forEach(f => groups[f.severity].push(f));
    return groups;
  }, [displayFindings]);
  const getSeverityClass = useCallback(
    (severity: FindingSeverity) => {
      switch (severity) {
        case 'CAT_I':
          return classes.catI;
        case 'CAT_II':
          return classes.catII;
        case 'CAT_III':
          return classes.catIII;
        default:
          return '';
      }
    },
    [classes.catI, classes.catII, classes.catIII],
  );

  // Auto-save (Insights pattern)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionsRef = useRef(selections);
  selectionsRef.current = selections;
  const profileNameRef = useRef(profileName);
  profileNameRef.current = profileName;
  const profileDescriptionRef = useRef(profileDescription);
  profileDescriptionRef.current = profileDescription;
  const savedProfileIdRef = useRef(savedProfileId);
  savedProfileIdRef.current = savedProfileId;
  const savingInProgress = useRef(false);

  const performAutoSave = useCallback(async () => {
    const name = profileNameRef.current;
    if (!name || savingInProgress.current) return;
    savingInProgress.current = true;
    setAutoSaveStatus('saving');
    setSaveError(null);
    try {
      const allSelections = allFindings.map(f => ({
        ruleId: f.ruleId,
        enabled: selectionsRef.current[f.ruleId]?.enabled ?? false,
        parameters: selectionsRef.current[f.ruleId]?.parameters ?? {},
        scope: selectionsRef.current[f.ruleId]?.scope,
      }));
      const effectiveScanId = isEditMode
        ? editProfile?.creationScanId || editProfile?.complianceProfileId || ''
        : jobId ?? '';
      const saved = await api.saveRemediationProfile({
        id:
          savedProfileIdRef.current ??
          (isEditMode ? editProfile?.id : undefined),
        name,
        description: profileDescriptionRef.current,
        complianceProfileId:
          editProfile?.complianceProfileId || resolvedProfileId,
        scanId: effectiveScanId,
        selections: allSelections,
        status: 'draft',
      });
      if (!savedProfileIdRef.current) {
        savedProfileIdRef.current = saved.id;
        setSavedProfileId(saved.id);
      }
      setAutoSaveStatus('saved');
    } catch (err) {
      setAutoSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : 'Auto-save failed');
    } finally {
      savingInProgress.current = false;
    }
  }, [api, allFindings, editProfile, isEditMode, jobId, resolvedProfileId]);

  useEffect(() => {
    if (profileSaved) setProfileSaved(false);
  }, [selections, profileName, profileDescription]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (Object.keys(selections).length === 0 || !profileName) {
      hasInitializedRef.current = false;
      return undefined;
    }
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      return undefined;
    }
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave();
    }, 2000);
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [selections, profileName, profileDescription, performAutoSave]);

  const renderAutoSaveStatus = () => {
    if (autoSaveStatus === 'saving')
      return (
        <div
          className={classes.autoSaveIndicator}
          data-testid="auto-save-status"
        >
          <Typography
            variant="caption"
            style={{ color: STATUS_COLORS.neutral }}
          >
            Saving...
          </Typography>
        </div>
      );
    if (autoSaveStatus === 'saved')
      return (
        <div
          className={classes.autoSaveIndicator}
          data-testid="auto-save-status"
        >
          <CheckCircleIcon className={classes.savedIcon} />
          <Typography
            variant="caption"
            style={{ color: STATUS_COLORS.success }}
          >
            {profileSaved ? 'Saved' : 'Draft saved'}
          </Typography>
        </div>
      );
    if (autoSaveStatus === 'error')
      return (
        <div
          className={classes.autoSaveIndicator}
          data-testid="auto-save-status"
        >
          <WarningIcon style={{ fontSize: 14, color: STATUS_COLORS.error }} />
          <Typography variant="caption" style={{ color: STATUS_COLORS.error }}>
            Save failed
          </Typography>
        </div>
      );
    return null;
  };

  const failedListItems = useMemo((): ListItem[] => {
    const items: ListItem[] = [];
    (['CAT_I', 'CAT_II', 'CAT_III'] as FindingSeverity[]).forEach(sev => {
      const sevFindings = failedFindings.filter(f => f.severity === sev);
      if (sevFindings.length === 0) return;
      const sevEnabledCount = sevFindings.filter(
        f => selections[f.ruleId]?.enabled,
      ).length;
      items.push({
        type: 'header',
        key: `failed-${sev}`,
        severity: sev,
        label: severityLabel[sev],
        count: sevFindings.length,
        enabledCount: sevEnabledCount,
      });
      sevFindings.forEach(f => items.push({ type: 'finding', finding: f }));
    });
    return items;
  }, [failedFindings, selections]);

  const passingListItems = useMemo((): ListItem[] => {
    return passingFindings.map(f => ({ type: 'finding' as const, finding: f }));
  }, [passingFindings]);

  const categoryListItems = useMemo((): ListItem[] => {
    const items: ListItem[] = [];
    (['CAT_I', 'CAT_II', 'CAT_III'] as FindingSeverity[]).forEach(severity => {
      const group = groupedBySeverity[severity];
      if (group.length === 0) return;
      const groupEnabled = group.filter(
        f => selections[f.ruleId]?.enabled,
      ).length;
      const sorted = [...group].sort((a, b) => {
        const aFailed = a.failCount > 0 ? 0 : 1;
        const bFailed = b.failCount > 0 ? 0 : 1;
        return aFailed - bFailed;
      });
      items.push({
        type: 'header',
        key: `cat-${severity}`,
        severity,
        label: severityLabel[severity],
        count: group.length,
        enabledCount: groupEnabled,
      });
      sorted.forEach(f => items.push({ type: 'finding', finding: f }));
    });
    return items;
  }, [groupedBySeverity, selections]);

  const virtualListProps = useMemo(
    () => ({
      selections,
      onToggleFinding: toggleFinding,
      onToggleExpanded: toggleExpanded,
      onSetScope: setScope,
      onUpdateParameter: updateParameter,
      cardClasses: classes,
      getSeverityClass,
      severityChipClass: classes.severityChip,
    }),
    [
      selections,
      classes,
      toggleFinding,
      toggleExpanded,
      setScope,
      updateParameter,
      getSeverityClass,
    ],
  );

  const renderStatusView = () => {
    const failedGroupEnabled = failedFindings.filter(
      f => selections[f.ruleId]?.enabled,
    ).length;
    const passingGroupEnabled = passingFindings.filter(
      f => selections[f.ruleId]?.enabled,
    ).length;

    return (
      <>
        {failedFindings.length > 0 && (
          <>
            <div
              className={classes.sectionHeader}
              role="button"
              tabIndex={0}
              data-testid="failed-rules-header"
            >
              <Box display="flex" alignItems="center" style={{ gap: 8 }}>
                <Chip
                  label={`Rules with Failures (${failedFindings.length})`}
                  size="small"
                  style={{
                    backgroundColor: STATUS_COLORS.error,
                    color: '#fff',
                    fontWeight: 600,
                  }}
                />
                <Typography variant="body2" color="textSecondary">
                  {failedGroupEnabled}/{failedFindings.length} selected
                </Typography>
              </Box>
            </div>
            <VirtualizedFindingsList
              items={failedListItems}
              {...virtualListProps}
            />
          </>
        )}

        {passingFindings.length > 0 && (
          <>
            <div
              className={classes.sectionHeader}
              role="button"
              tabIndex={0}
              data-testid="passing-rules-header"
              onClick={() => setPassingRulesExpanded(!passingRulesExpanded)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setPassingRulesExpanded(!passingRulesExpanded);
                }
              }}
            >
              <Box display="flex" alignItems="center" style={{ gap: 8 }}>
                <Chip
                  label={`Compliant Rules (${passingFindings.length})`}
                  size="small"
                  style={{
                    backgroundColor: STATUS_COLORS.success,
                    color: '#fff',
                    fontWeight: 600,
                  }}
                />
                <Typography variant="body2" color="textSecondary">
                  {passingGroupEnabled}/{passingFindings.length} selected
                </Typography>
              </Box>
              <IconButton
                size="small"
                aria-label={
                  passingRulesExpanded
                    ? 'Collapse compliant rules'
                    : 'Expand compliant rules'
                }
              >
                {passingRulesExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </div>
            <Collapse in={passingRulesExpanded}>
              <div className={classes.passingNote}>
                <CheckCircleIcon className={classes.passingNoteIcon} />
                <Typography variant="body2" color="textSecondary">
                  These rules are currently compliant. Enable to enforce
                  continuous compliance.
                </Typography>
              </div>
              <VirtualizedFindingsList
                items={passingListItems}
                listHeight={400}
                {...virtualListProps}
              />
            </Collapse>
          </>
        )}
      </>
    );
  };

  const renderCategoryView = () => {
    return (
      <VirtualizedFindingsList
        items={categoryListItems}
        {...virtualListProps}
      />
    );
  };

  if (loading)
    return (
      <Box p={4}>
        <Progress />
        <Typography variant="body2" align="center" style={{ marginTop: 16 }}>
          Loading findings for remediation...
        </Typography>
      </Box>
    );

  return (
    <>
      <Breadcrumbs>
        <Typography
          color="primary"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate('/compliance')}
        >
          Compliance
        </Typography>
        {isEditMode ? (
          <Typography
            color="primary"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/compliance/remediations')}
          >
            Remediations
          </Typography>
        ) : (
          <Typography
            color="primary"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/compliance/results/${jobId}`)}
          >
            Scan Results
          </Typography>
        )}
        <Typography>
          {(() => {
            if (isApplyMode) return 'Apply Remediation';
            if (isEditMode) return 'Edit Remediation';
            return 'Remediation';
          })()}
        </Typography>
      </Breadcrumbs>
      {(contextProfileName || contextInventoryName) && (
        <Box
          display="flex"
          alignItems="center"
          mt={1}
          mb={1}
          style={{ gap: 8 }}
        >
          {contextProfileName && (
            <Chip label={contextProfileName} size="small" variant="outlined" />
          )}
          {contextInventoryName && (
            <Chip
              label={contextInventoryName}
              size="small"
              variant="outlined"
              icon={<SettingsIcon style={{ fontSize: 14 }} />}
            />
          )}
        </Box>
      )}
      {!(contextProfileName || contextInventoryName) && <Box mt={2} />}
      <div className={classes.profileHeader}>
        <Box flex={1} display="flex" flexDirection="column" style={{ gap: 12 }}>
          <TextField
            label="Remediation Name"
            variant="outlined"
            size="small"
            fullWidth
            required
            value={profileName}
            onChange={e => setProfileName(e.target.value)}
            placeholder="e.g., production-web-servers-stig-v2r8"
            helperText={
              !profileName
                ? 'Name your remediation to enable auto-save'
                : undefined
            }
            inputProps={{ 'aria-label': 'Remediation profile name' }}
          />
          <TextField
            label="Description (optional)"
            variant="outlined"
            size="small"
            fullWidth
            multiline
            minRows={1}
            maxRows={3}
            value={profileDescription}
            onChange={e => setProfileDescription(e.target.value)}
            placeholder="e.g., STIG for production web tier"
            inputProps={{ 'aria-label': 'Remediation profile description' }}
          />
        </Box>
        <Box
          display="flex"
          flexDirection="column"
          alignItems="flex-end"
          justifyContent="flex-start"
          pt={1}
        >
          {renderAutoSaveStatus()}
        </Box>
      </div>
      {saveError && (
        <Box mb={2}>
          <Typography color="error" variant="body2">
            {saveError}
          </Typography>
        </Box>
      )}
      {/* Row 1 — Filter bar */}
      <div className={classes.filterBar}>
        <TextField
          placeholder="Search rules by name, ID, STIG ID, or description..."
          variant="outlined"
          size="small"
          style={{ minWidth: 240, flex: '1 1 240px', maxWidth: 360 }}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <Box mr={1} display="flex" alignItems="center">
                <span role="img" aria-label="search">
                  🔍
                </span>
              </Box>
            ),
          }}
        />
        <FilterGroup
          label="Severity"
          options={SEVERITY_OPTIONS}
          activeValue={severityFilter}
          expanded={expandedGroup === 'severity'}
          onToggleExpand={() => handleGroupToggle('severity')}
          onSelect={key => setSeverityFilter(key as 'all' | FindingSeverity)}
        />
        {!isEditMode && (
          <FilterGroup
            label="State"
            options={STATE_OPTIONS}
            activeValue={stateFilter}
            expanded={expandedGroup === 'state'}
            onToggleExpand={() => handleGroupToggle('state')}
            onSelect={key => setStateFilter(key as 'all' | FindingState)}
          />
        )}
        <FilterGroup
          label="Risk"
          options={RISK_OPTIONS}
          activeValue={riskActiveValue}
          expanded={expandedGroup === 'risk'}
          onToggleExpand={() => handleGroupToggle('risk')}
          onSelect={handleRiskSelect}
        />
        <Chip
          label={`${displayFindings.length} rules`}
          variant="outlined"
          size="small"
        />
        {activeFilterCount > 0 && (
          <Chip
            label="Clear all"
            size="small"
            variant="outlined"
            onDelete={clearFilters}
            onClick={clearFilters}
          />
        )}
      </div>
      {/* Row 2 — View + selection controls */}
      <div className={classes.summaryBar}>
        <div className={classes.summaryCount}>
          <Typography variant="body1">
            <strong>{failedFindings.length}</strong> rules with failures
          </Typography>
          <Typography variant="body1" color="textSecondary">
            <strong>{passingFindings.length}</strong> compliant
          </Typography>
          <Typography variant="body1" style={{ color: STATUS_COLORS.success }}>
            <strong>{enabledCount}</strong> selected
          </Typography>
          <Typography variant="body1" color="textSecondary">
            <strong>{disabledCount}</strong> skipped
          </Typography>
          <Typography variant="body1" color="textSecondary">
            <strong>{totalAffectedHosts}</strong> hosts affected
          </Typography>
        </div>
        <div className={classes.bulkActions}>
          <ButtonGroup
            size="small"
            variant="outlined"
            className={classes.viewToggle}
            aria-label="View mode toggle"
          >
            <Button
              onClick={() => setViewMode('status')}
              variant={viewMode === 'status' ? 'contained' : 'outlined'}
              color={viewMode === 'status' ? 'primary' : 'default'}
              data-testid="view-by-status"
            >
              By Status
            </Button>
            <Button
              onClick={() => setViewMode('category')}
              variant={viewMode === 'category' ? 'contained' : 'outlined'}
              color={viewMode === 'category' ? 'primary' : 'default'}
              data-testid="view-by-category"
            >
              By Category
            </Button>
          </ButtonGroup>
          <Tooltip title="Show only selected rules for a final review before launching">
            <Button
              size="small"
              variant={reviewMode ? 'contained' : 'outlined'}
              color={reviewMode ? 'primary' : 'default'}
              onClick={() => setReviewMode(!reviewMode)}
              data-testid="review-mode-toggle"
            >
              {reviewMode ? `Review (${enabledCount})` : 'Review'}
            </Button>
          </Tooltip>
          {!isEditMode && (
            <ButtonGroup
              size="small"
              variant="outlined"
              aria-label="Host scope for all rules"
            >
              <Tooltip title="Remediate only failed hosts for each rule">
                <Button
                  onClick={() => setScopeAll('failed_only')}
                  variant={
                    dominantScope === 'failed_only' ? 'contained' : 'outlined'
                  }
                  color={
                    dominantScope === 'failed_only' ? 'primary' : 'default'
                  }
                >
                  Failed Only
                </Button>
              </Tooltip>
              <Tooltip title="Apply to every host, standardizing configuration across the inventory">
                <Button
                  onClick={() => setScopeAll('standardize_all')}
                  variant={
                    dominantScope === 'standardize_all'
                      ? 'contained'
                      : 'outlined'
                  }
                  color={
                    dominantScope === 'standardize_all' ? 'primary' : 'default'
                  }
                >
                  All Hosts
                </Button>
              </Tooltip>
            </ButtonGroup>
          )}
        </div>
      </div>
      {/* Selection actions row */}
      <Box mb={2}>
        <div className={classes.selectionActions}>
          <Tooltip title="Enable all rules currently visible (respects search and filters)">
            <Button size="small" variant="outlined" onClick={selectDisplayed}>
              Select Displayed
            </Button>
          </Tooltip>
          <Tooltip title="Disable all rules currently visible">
            <Button size="small" variant="outlined" onClick={deselectDisplayed}>
              Deselect Displayed
            </Button>
          </Tooltip>
          <Tooltip title="Enable all rules that have at least one failing host">
            <Button size="small" variant="outlined" onClick={selectAllFailed}>
              Select All Failed
            </Button>
          </Tooltip>
          <Tooltip title="Enable all failed rules that are safe for AAP — excludes rules tagged 'Breaks AAP connectivity'">
            <Button
              size="small"
              variant="outlined"
              onClick={selectSafeOnly}
              style={{
                borderColor: STATUS_COLORS.success,
                color: STATUS_COLORS.success,
              }}
            >
              Select Safe Only
            </Button>
          </Tooltip>
          <Tooltip title="Disable every rule in this remediation">
            <Button
              size="small"
              variant="outlined"
              color="secondary"
              onClick={clearAll}
            >
              Deselect All
            </Button>
          </Tooltip>
        </div>
      </Box>
      {viewMode === 'status' ? renderStatusView() : renderCategoryView()}
      <Divider style={{ margin: '24px 0' }} />
      <Box display="flex" justifyContent="flex-end" style={{ gap: 16 }}>
        <Button
          variant="outlined"
          color="primary"
          size="large"
          startIcon={<SaveIcon />}
          disabled={!profileName || enabledCount === 0 || profileSaved}
          onClick={async () => {
            if (savingInProgress.current) return;
            if (autoSaveTimerRef.current) {
              clearTimeout(autoSaveTimerRef.current);
              autoSaveTimerRef.current = null;
            }
            try {
              const allSelections = allFindings.map(f => ({
                ruleId: f.ruleId,
                enabled: selections[f.ruleId]?.enabled ?? false,
                parameters: selections[f.ruleId]?.parameters ?? {},
                scope: selections[f.ruleId]?.scope,
              }));
              const effectiveScanId = isEditMode
                ? editProfile?.creationScanId ||
                  editProfile?.complianceProfileId ||
                  ''
                : jobId ?? '';
              const saved = await api.saveRemediationProfile({
                id:
                  savedProfileId ?? (isEditMode ? editProfile?.id : undefined),
                name: profileName,
                description: profileDescription,
                complianceProfileId:
                  editProfile?.complianceProfileId || resolvedProfileId,
                scanId: effectiveScanId,
                selections: allSelections,
                status: 'saved',
              });
              if (!savedProfileId) {
                setSavedProfileId(saved.id);
                savedProfileIdRef.current = saved.id;
              }
              setProfileSaved(true);
              setAutoSaveStatus('saved');
            } catch (err) {
              setSaveError(
                err instanceof Error ? err.message : 'Failed to save',
              );
            }
          }}
        >
          {profileSaved ? 'Saved' : 'Save'}
        </Button>
        <Button
          variant="contained"
          color="primary"
          size="large"
          startIcon={<PlayArrowIcon />}
          disabled={
            enabledCount === 0 || !canRemediate || launching || !profileName
          }
          title={(() => {
            if (!canRemediate)
              return 'You do not have permission to apply remediations';
            if (!profileName) return 'Enter a remediation name first';
            return undefined;
          })()}
          onClick={async () => {
            setLaunching(true);
            try {
              const enabledSelections = allFindings
                .filter(f => selections[f.ruleId]?.enabled)
                .map(f => ({
                  ruleId: f.ruleId,
                  enabled: true,
                  scope: selections[f.ruleId].scope ?? ('failed_only' as const),
                  parameters: selections[f.ruleId].parameters,
                }));
              const effectiveScanId = isEditMode
                ? editProfile?.creationScanId ||
                  editProfile?.complianceProfileId ||
                  ''
                : jobId ?? '';
              const saved = await api.saveRemediationProfile({
                id:
                  savedProfileId ?? (isEditMode ? editProfile?.id : undefined),
                name: profileName || editProfile?.name || 'Remediation',
                description:
                  profileDescription || editProfile?.description || '',
                complianceProfileId:
                  editProfile?.complianceProfileId || resolvedProfileId,
                scanId: effectiveScanId,
                selections: enabledSelections,
                status: 'saved',
              });
              const params = new URLSearchParams();
              params.set('profileId', saved.id);
              params.set('scanId', effectiveScanId);
              navigate(
                `/compliance/execute/${effectiveScanId}?${params.toString()}`,
              );
            } catch (err) {
              setSaveError(
                err instanceof Error
                  ? err.message
                  : 'Failed to prepare remediation',
              );
              setLaunching(false);
            }
          }}
        >
          {launching
            ? 'Preparing...'
            : `Apply Remediation (${enabledCount} rules, ${totalAffectedHosts} hosts)`}
        </Button>
      </Box>
    </>
  );
};
