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

import { useState, useMemo, type ReactNode } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
  makeStyles,
  useTheme,
} from '@material-ui/core';
import ArrowDropDownIcon from '@material-ui/icons/ArrowDropDown';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import CheckCircleOutlineIcon from '@material-ui/icons/CheckCircleOutline';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import type { Violation } from '@ansible/backstage-apme-common/types';
import {
  SEVERITY_STYLES,
  normalizeSeverity,
  fixMethodLabel,
  fixMethodTooltip,
  isFixableViolation,
  categoryLabel,
} from '@ansible/backstage-apme-common/severity';
import { effectiveViolationFixType } from '@ansible/backstage-apme-common/proposalTier';
import { useApmeAiEnabled } from '../../hooks/useApmeEnabled';
import { acknowledgeButtonLabel } from '../../hooks/useViolationAcknowledge';
import { EditInDevSpacesButton } from '../EditInDevSpacesButton';
import { DiffView } from '../DiffView';

type SortColumn = 'severity' | 'fixMethod' | 'rule' | 'file';

const useStyles = makeStyles(theme => ({
  wrapper: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 4,
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(0.75, 1.5),
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
    flexWrap: 'wrap',
    gap: theme.spacing(1),
  },
  selectGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  selectMenuButton: {
    fontSize: 12,
    textTransform: 'none',
    color: theme.palette.text.secondary,
    padding: '2px 4px',
    minWidth: 0,
  },
  noData: {
    padding: theme.spacing(4),
    textAlign: 'center',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
    '& thead': {
      backgroundColor:
        theme.palette.type === 'dark' ? 'rgba(255,255,255,0.04)' : '#f5f5f5',
      borderBottom: `1px solid ${theme.palette.divider}`,
    },
    '& th': {
      textAlign: 'left',
      padding: '10px 12px',
      fontWeight: 600,
      fontSize: 11,
      color: theme.palette.text.secondary,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      userSelect: 'none',
      whiteSpace: 'nowrap',
    },
    '& th.sortable': {
      cursor: 'pointer',
      '&:hover': { color: theme.palette.text.primary },
    },
    '& td': {
      padding: '10px 12px',
      borderBottom: `1px solid ${theme.palette.divider}`,
      verticalAlign: 'middle',
    },
    '& tbody tr:last-child td': {
      borderBottom: 'none',
    },
    '& tbody tr.dataRow': {
      cursor: 'pointer',
      '&:hover': { backgroundColor: theme.palette.action.hover },
    },
  },
  severityChip: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    whiteSpace: 'nowrap',
  },
  ruleId: {
    fontFamily: 'monospace',
    fontSize: 12,
    backgroundColor:
      theme.palette.type === 'dark'
        ? theme.palette.grey[800]
        : theme.palette.grey[100],
    padding: '2px 6px',
    borderRadius: 3,
    display: 'inline-block',
    marginRight: theme.spacing(0.5),
  },
  expandedCell: {
    padding: 0,
    backgroundColor: theme.palette.background.default,
  },
  description: {
    marginTop: theme.spacing(0.5),
    color: theme.palette.text.secondary,
    fontSize: 13,
    lineHeight: 1.5,
  },
  codeBlock: {
    marginTop: theme.spacing(1),
    fontFamily: 'monospace',
    fontSize: 12,
    backgroundColor: '#1e1e2e',
    color: '#cdd6f4',
    borderRadius: 6,
    overflow: 'hidden',
  },
  codeLine: {
    display: 'flex',
    alignItems: 'stretch',
    minHeight: 22,
  },
  codeLineNumber: {
    width: 36,
    textAlign: 'right',
    padding: '2px 8px',
    color: theme.palette.text.disabled,
    userSelect: 'none',
    flexShrink: 0,
    borderRight: `1px solid ${theme.palette.divider}`,
  },
  codeLineContent: {
    padding: '2px 12px',
    whiteSpace: 'pre',
    flex: 1,
  },
  codeLineHighlighted: {
    backgroundColor: 'rgba(243, 139, 168, 0.15)',
    borderLeft: '3px solid #f38ba8',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing(1),
    flexWrap: 'wrap',
    gap: theme.spacing(1),
  },
  footerMeta: {
    display: 'flex',
    gap: theme.spacing(2),
    color: theme.palette.text.secondary,
    fontSize: 12,
  },
  footerActions: {
    display: 'flex',
    gap: theme.spacing(1),
  },
  fileLink: {
    color: theme.palette.primary.main,
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: 12,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    background: 'none',
    border: 'none',
    padding: 0,
    '&:hover': { textDecoration: 'underline' },
  },
}));

function FixMethodDisplay({
  violation,
  enableAi,
  aiAssistedViolationIds,
}: {
  violation: Violation;
  enableAi: boolean;
  aiAssistedViolationIds?: ReadonlySet<number>;
}) {
  const theme = useTheme();
  const fixType = effectiveViolationFixType(
    violation,
    enableAi,
    aiAssistedViolationIds,
  );
  const label = fixMethodLabel(fixType);
  const tooltip = fixMethodTooltip(fixType);
  let chip;
  if (fixType === 'auto') {
    chip = (
      <Chip
        size="small"
        label={label}
        style={{
          backgroundColor: theme.palette.success.main,
          color: theme.palette.success.contrastText,
          fontWeight: 600,
          fontSize: 11,
          height: 22,
          borderRadius: 3,
        }}
      />
    );
  } else if (fixType === 'ai') {
    chip = (
      <Chip
        size="small"
        label={label}
        style={{
          backgroundColor: theme.palette.info.main,
          color: theme.palette.info.contrastText,
          fontWeight: 600,
          fontSize: 11,
          height: 22,
          borderRadius: 3,
        }}
      />
    );
  } else {
    chip = (
      <Chip
        size="small"
        label={label}
        variant="outlined"
        style={{
          fontSize: 11,
          height: 22,
          borderRadius: 3,
          color: theme.palette.text.secondary,
          borderColor: theme.palette.divider,
        }}
      />
    );
  }
  return (
    <Tooltip title={tooltip}>
      <span>{chip}</span>
    </Tooltip>
  );
}

function CodePreview({
  yaml,
  highlightLine,
}: {
  yaml?: string;
  highlightLine: number;
}) {
  const classes = useStyles();
  if (!yaml) return null;
  const lines = yaml.split('\n');
  return (
    <div className={classes.codeBlock}>
      {lines.map((content, i) => {
        const lineNum = i + 1;
        const isHighlighted =
          lineNum === highlightLine
            ? true
            : content.trim().length > 0 && i === 1;
        return (
          <div
            key={i}
            className={`${classes.codeLine} ${isHighlighted ? classes.codeLineHighlighted : ''}`}
          >
            <span className={classes.codeLineNumber}>{lineNum}</span>
            <span className={classes.codeLineContent}>{content}</span>
          </div>
        );
      })}
    </div>
  );
}

function fixMethodSortKey(
  violation: Violation,
  enableAi: boolean,
  aiAssistedViolationIds?: ReadonlySet<number>,
): number {
  const ft = effectiveViolationFixType(
    violation,
    enableAi,
    aiAssistedViolationIds,
  );
  if (ft === 'auto') return 0;
  if (ft === 'ai') return 1;
  if (ft === 'manual') return 2;
  return 3;
}

export interface ApmeViolationsTableFilterContext {
  totalViolationCount: number;
  activeFixTypeFilter: string;
  ruleFilter: string | null;
  autoFixCount: number;
  onClearFixTypeFilter?: () => void;
  onClearRuleFilter?: () => void;
}

export interface ApmeViolationsTableProps {
  violations: Violation[];
  /** When false, hides per-violation checkboxes (backend remediate is all-or-nothing). */
  selectionEnabled?: boolean;
  selectedIds?: Set<number>;
  onSelectionChange?: (ids: Set<number>) => void;
  toolbarActions?: ReactNode;
  /** Violation IDs that received AI proposals on the latest remediate run. */
  aiAssistedViolationIds?: ReadonlySet<number>;
  /** Dev Spaces factory URL for manual violations (repo or remediation branch). */
  devSpacesUrl?: string | null;
  filterContext?: ApmeViolationsTableFilterContext;
  /** When set, acknowledged violations are hidden unless showAcknowledgedOnly. */
  showAcknowledgedOnly?: boolean;
  onAcknowledge?: (violation: Violation) => Promise<void>;
  onUnacknowledge?: (violation: Violation) => Promise<void>;
  acknowledgingId?: number | null;
  isAcknowledged?: (violation: Violation) => boolean;
}

export const ApmeViolationsTable = ({
  violations,
  selectionEnabled = false,
  selectedIds,
  onSelectionChange,
  devSpacesUrl,
  toolbarActions,
  filterContext,
  aiAssistedViolationIds,
  showAcknowledgedOnly = false,
  onAcknowledge,
  onUnacknowledge,
  acknowledgingId = null,
  isAcknowledged: isAcknowledgedProp,
}: ApmeViolationsTableProps) => {
  const classes = useStyles();
  const enableAi = useApmeAiEnabled();
  const isAcknowledged = useMemo(
    () => isAcknowledgedProp ?? ((v: Violation) => v.suppressed === true),
    [isAcknowledgedProp],
  );
  const [localSelected, setLocalSelected] = useState<Set<number>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  const [sortCol, setSortCol] = useState<SortColumn>('severity');
  const [sortAsc, setSortAsc] = useState(true);
  const [selectMenuAnchor, setSelectMenuAnchor] = useState<null | HTMLElement>(
    null,
  );

  const selected = selectedIds ?? localSelected;
  const setSelected = onSelectionChange ?? setLocalSelected;

  const visible = useMemo(() => {
    return violations.filter(v => {
      const acknowledged = isAcknowledged(v);
      if (showAcknowledgedOnly) return acknowledged;
      return !acknowledged;
    });
  }, [violations, showAcknowledgedOnly, isAcknowledged]);

  const sorted = useMemo(() => {
    const list = [...visible];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case 'severity': {
          const sevA =
            SEVERITY_STYLES[normalizeSeverity(a.level)]?.sortOrder ?? 99;
          const sevB =
            SEVERITY_STYLES[normalizeSeverity(b.level)]?.sortOrder ?? 99;
          cmp = sevA - sevB;
          break;
        }
        case 'fixMethod':
          cmp =
            fixMethodSortKey(a, enableAi, aiAssistedViolationIds) -
            fixMethodSortKey(b, enableAi, aiAssistedViolationIds);
          break;
        case 'rule':
          cmp = a.rule_id.localeCompare(b.rule_id);
          break;
        case 'file':
          cmp = `${a.file}:${a.line}`.localeCompare(`${b.file}:${b.line}`);
          break;
        default:
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [visible, sortCol, sortAsc, enableAi, aiAssistedViolationIds]);

  const autoExpand = sorted.length <= 3;

  const selectable = sorted.filter(v =>
    isFixableViolation(v.remediation_class, enableAi),
  );
  const allSelected =
    selectable.length > 0 && selectable.every(v => selected.has(v.id));

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) setSortAsc(a => !a);
    else {
      setSortCol(col);
      setSortAsc(col === 'severity');
    }
  };

  const sortArrow = (col: SortColumn) => {
    if (sortCol !== col) return '';
    return sortAsc ? ' ↑' : ' ↓';
  };

  const selectByFilter = (filter: 'all' | 'auto' | 'ai' | 'clear') => {
    setSelectMenuAnchor(null);
    if (filter === 'clear') {
      setSelected(new Set());
      return;
    }
    const next = new Set<number>();
    for (const v of selectable) {
      const ft = effectiveViolationFixType(v, enableAi, aiAssistedViolationIds);
      if (filter === 'all') next.add(v.id);
      else if (filter === 'auto' && ft === 'auto') next.add(v.id);
      else if (filter === 'ai' && ft === 'ai') next.add(v.id);
    }
    setSelected(next);
  };

  const handleSelectAll = () => {
    if (allSelected) selectByFilter('clear');
    else selectByFilter('all');
  };

  const handleSelect = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleAcknowledgeToggle = async (violation: Violation) => {
    if (isAcknowledged(violation)) {
      if (onUnacknowledge) {
        await onUnacknowledge(violation);
      }
      return;
    }
    if (onAcknowledge) {
      await onAcknowledge(violation);
    }
    const next = new Set(selected);
    next.delete(violation.id);
    setSelected(next);
  };

  const isRowExpanded = (id: number) =>
    autoExpand ? !collapsedIds.has(id) : expandedIds.has(id);

  const toggleExpanded = (id: number) => {
    if (autoExpand) {
      setCollapsedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      setExpandedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  };

  if (sorted.length === 0) {
    const fixFilter = filterContext?.activeFixTypeFilter ?? 'all';
    const rule = filterContext?.ruleFilter;
    const autoCount = filterContext?.autoFixCount ?? 0;
    const totalCount = filterContext?.totalViolationCount ?? violations.length;

    let message = 'No violations match the current filters.';
    if (fixFilter === 'auto' && autoCount === 0) {
      message = rule
        ? `Rule ${rule} has no auto-fix violations. Switch to All fixable or clear the rule filter.`
        : 'No auto-fix violations match these filters. Switch to All fixable or clear filters.';
    } else if (rule && totalCount > 0) {
      message = `Rule ${rule} has no violations in this repo that match the current filters.`;
    }

    return (
      <div className={classes.noData}>
        <Typography variant="body1" color="textSecondary" gutterBottom>
          {message}
        </Typography>
        <Box
          display="flex"
          justifyContent="center"
          style={{ gap: 8, flexWrap: 'wrap' }}
        >
          {fixFilter !== 'all' && filterContext?.onClearFixTypeFilter && (
            <Button
              size="small"
              variant="outlined"
              onClick={filterContext.onClearFixTypeFilter}
            >
              Show all fixable
            </Button>
          )}
          {rule && filterContext?.onClearRuleFilter && (
            <Button
              size="small"
              variant="text"
              onClick={filterContext.onClearRuleFilter}
            >
              Clear rule filter
            </Button>
          )}
        </Box>
      </div>
    );
  }

  return (
    <Box className={classes.wrapper}>
      <div className={classes.toolbar}>
        {selectionEnabled && (
          <div className={classes.selectGroup}>
            <Checkbox
              size="small"
              indeterminate={selected.size > 0 && !allSelected}
              checked={allSelected}
              onChange={handleSelectAll}
              style={{ padding: 4 }}
            />
            <Button
              size="small"
              className={classes.selectMenuButton}
              endIcon={<ArrowDropDownIcon style={{ fontSize: 18 }} />}
              onClick={e => setSelectMenuAnchor(e.currentTarget)}
            >
              {selected.size > 0 ? `${selected.size} selected` : 'Select'}
            </Button>
            <Menu
              anchorEl={selectMenuAnchor}
              open={Boolean(selectMenuAnchor)}
              onClose={() => setSelectMenuAnchor(null)}
            >
              <MenuItem onClick={() => selectByFilter('all')}>
                All fixable
              </MenuItem>
              <MenuItem onClick={() => selectByFilter('auto')}>
                Auto-fixes only
              </MenuItem>
              {enableAi && (
                <MenuItem onClick={() => selectByFilter('ai')}>
                  AI-assisted only
                </MenuItem>
              )}
              <MenuItem onClick={() => selectByFilter('clear')}>
                Clear selection
              </MenuItem>
            </Menu>
          </div>
        )}
        {toolbarActions}
      </div>

      <table className={classes.table}>
        <thead>
          <tr>
            {selectionEnabled && <th style={{ width: 40 }} />}
            <th
              className="sortable"
              style={{ width: 110 }}
              onClick={() => handleSort('severity')}
            >
              Severity{sortArrow('severity')}
            </th>
            <th
              className="sortable"
              style={{ width: 130 }}
              onClick={() => handleSort('fixMethod')}
            >
              Fix method{sortArrow('fixMethod')}
            </th>
            <th className="sortable" onClick={() => handleSort('rule')}>
              Rule &amp; description{sortArrow('rule')}
            </th>
            <th
              className="sortable"
              style={{ width: 180 }}
              onClick={() => handleSort('file')}
            >
              File{sortArrow('file')}
            </th>
            <th style={{ width: 48 }}>Edit</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(v => {
            const sev = normalizeSeverity(v.level);
            const style = SEVERITY_STYLES[sev];
            const canSelect = isFixableViolation(v.remediation_class, enableAi);
            const cat = v.category
              ? categoryLabel(v.category)
              : v.validator_source;
            const isExpanded = isRowExpanded(v.id);

            return [
              <tr
                key={v.id}
                className="dataRow"
                onClick={() => toggleExpanded(v.id)}
              >
                {selectionEnabled && (
                  <td
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => e.stopPropagation()}
                  >
                    <Tooltip
                      title={
                        canSelect
                          ? 'Include in remediation when selected'
                          : 'Manual review — edit in Dev Spaces or apply auto-generated fixes to other rows'
                      }
                    >
                      <span>
                        <Checkbox
                          size="small"
                          checked={selected.has(v.id)}
                          disabled={!canSelect}
                          onChange={() => handleSelect(v.id)}
                          style={{ padding: 4 }}
                        />
                      </span>
                    </Tooltip>
                  </td>
                )}
                <td>
                  <span
                    className={classes.severityChip}
                    style={{
                      backgroundColor: style.background,
                      color: style.text,
                    }}
                  >
                    {style.label.toUpperCase()}
                  </span>
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <FixMethodDisplay
                    violation={v}
                    enableAi={enableAi}
                    aiAssistedViolationIds={aiAssistedViolationIds}
                  />
                </td>
                <td>
                  <span className={classes.ruleId}>{v.rule_id}</span>
                  <Typography component="span" variant="body2">
                    {v.message}
                  </Typography>
                </td>
                <td>
                  <button
                    type="button"
                    className={classes.fileLink}
                    onClick={e => e.stopPropagation()}
                    title={`${v.file}:${v.line}`}
                  >
                    {v.file.split('/').pop()}:{v.line}
                    <OpenInNewIcon style={{ fontSize: 12 }} />
                  </button>
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <IconButton size="small" onClick={() => toggleExpanded(v.id)}>
                    {isExpanded ? (
                      <ExpandLessIcon fontSize="small" />
                    ) : (
                      <ExpandMoreIcon fontSize="small" />
                    )}
                  </IconButton>
                </td>
              </tr>,
              isExpanded ? (
                <tr key={`${v.id}-detail`}>
                  <td
                    colSpan={selectionEnabled ? 6 : 5}
                    className={classes.expandedCell}
                  >
                    <Collapse in={isExpanded}>
                      <Box padding={2}>
                        <Typography
                          variant="body2"
                          className={classes.description}
                        >
                          {v.ai_reason ||
                            `Rule ${v.rule_id} detected in ${v.file}`}
                        </Typography>
                        {v.ai_suggestion && (
                          <Typography
                            variant="body2"
                            style={{ marginTop: 8, fontStyle: 'italic' }}
                          >
                            Guidance: {v.ai_suggestion}
                          </Typography>
                        )}
                        {v.fixed_yaml ? (
                          <DiffView
                            before={v.original_yaml}
                            after={v.fixed_yaml}
                            title="Proposed fix"
                          />
                        ) : (
                          <CodePreview
                            yaml={v.original_yaml}
                            highlightLine={v.line}
                          />
                        )}
                        <div className={classes.footer}>
                          <div className={classes.footerMeta}>
                            <span>
                              Validator: <strong>{v.validator_source}</strong>
                            </span>
                            {v.scope && (
                              <span>
                                Scope: <strong>{v.scope}</strong>
                              </span>
                            )}
                            <span>
                              Category: <strong>{cat}</strong>
                            </span>
                          </div>
                          <div className={classes.footerActions}>
                            {!canSelect && devSpacesUrl && (
                              <EditInDevSpacesButton
                                url={devSpacesUrl}
                                label="Edit in Dev Spaces"
                              />
                            )}
                            {(onAcknowledge || onUnacknowledge) && (
                              <Tooltip
                                title={
                                  isAcknowledged(v)
                                    ? 'Remove acknowledgment — violation will appear in scans again'
                                    : "Acknowledge — won't block merges but remains visible when filtered"
                                }
                              >
                                <Button
                                  size="small"
                                  variant="text"
                                  style={{ fontSize: 12 }}
                                  color={
                                    isAcknowledged(v) ? 'default' : 'primary'
                                  }
                                  startIcon={
                                    isAcknowledged(v) ? (
                                      <CheckCircleOutlineIcon
                                        style={{ fontSize: 14 }}
                                      />
                                    ) : undefined
                                  }
                                  disabled={acknowledgingId === v.id}
                                  onClick={() =>
                                    void handleAcknowledgeToggle(v)
                                  }
                                >
                                  {acknowledgeButtonLabel(
                                    acknowledgingId,
                                    v.id,
                                    isAcknowledged(v),
                                  )}
                                </Button>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      </Box>
                    </Collapse>
                  </td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
      </table>
    </Box>
  );
};
