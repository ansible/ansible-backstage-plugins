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
  Collapse,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
  makeStyles,
} from '@material-ui/core';
import ArrowDropDownIcon from '@material-ui/icons/ArrowDropDown';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import type { Violation } from '@ansible/backstage-apme-common/types';
import {
  SEVERITY_STYLES,
  normalizeSeverity,
  effectiveFixType,
  isFixableViolation,
  categoryLabel,
} from '@ansible/backstage-apme-common/severity';
import { useApmeAiEnabled } from '../../hooks/useApmeEnabled';
import { DiffView } from '../DiffView';
import { FixChipStyled, type FixChipStatus } from '../FixChipStyled';
import {
  formatViolationMessage,
  yamlSnippetAroundLine,
} from '../../utils/violationRemediation';

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
    backgroundColor: theme.palette.grey[100],
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
    color: '#6c7086',
    userSelect: 'none',
    flexShrink: 0,
    borderRight: '1px solid #313244',
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
  diffPanels: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: theme.spacing(1.5),
    marginTop: theme.spacing(1.5),
    [theme.breakpoints.down('sm')]: {
      gridTemplateColumns: '1fr',
    },
  },
  diffPanel: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 4,
    overflow: 'hidden',
  },
  diffPanelLabel: {
    padding: theme.spacing(0.75, 1.5),
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    backgroundColor:
      theme.palette.type === 'dark' ? 'rgba(255,255,255,0.04)' : '#f5f5f5',
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  snippetEllipsis: {
    display: 'block',
    padding: theme.spacing(0.5, 1.5),
    fontSize: 11,
    color: theme.palette.text.secondary,
    fontFamily: 'monospace',
  },
  issuesList: {
    margin: 0,
    paddingLeft: theme.spacing(2.5),
    fontSize: 13,
    lineHeight: 1.5,
    '& li': {
      marginBottom: theme.spacing(0.75),
    },
  },
  suggestionPanel: {
    fontSize: 13,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    fontFamily: 'monospace',
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

export interface ViolationRowDiff {
  before?: string;
  after?: string;
}

export interface ApmeViolationsTableFilterContext {
  totalViolationCount: number;
  activeFixTypeFilter: string;
  ruleFilter: string | null;
  autoFixCount: number;
  onClearFixTypeFilter?: () => void;
  onClearRuleFilter?: () => void;
}

function CodePreview({
  yaml,
  highlightLine,
  startLine = 1,
}: {
  yaml?: string;
  highlightLine: number;
  startLine?: number;
}) {
  const classes = useStyles();
  if (!yaml) return null;
  const lines = yaml.split('\n');
  return (
    <div className={classes.codeBlock}>
      {lines.map((content, i) => {
        const lineNum = startLine + i;
        const isHighlighted = lineNum === highlightLine;
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

function IssuesList({ issues }: { issues: string[] }) {
  const classes = useStyles();
  if (issues.length === 0) {
    return null;
  }
  return (
    <ul className={classes.issuesList}>
      {issues.map((issue, index) => (
        <li key={`${index}-${issue}`}>{issue}</li>
      ))}
    </ul>
  );
}

function CurrentYamlPanel({
  yaml,
  highlightLine,
}: {
  yaml: string;
  highlightLine: number;
}) {
  const classes = useStyles();
  const { snippet, startLine, truncatedAbove, truncatedBelow } =
    yamlSnippetAroundLine(yaml, highlightLine);

  return (
    <>
      {truncatedAbove && (
        <Typography variant="caption" className={classes.snippetEllipsis}>
          …
        </Typography>
      )}
      <CodePreview
        yaml={snippet}
        highlightLine={highlightLine}
        startLine={startLine}
      />
      {truncatedBelow && (
        <Typography variant="caption" className={classes.snippetEllipsis}>
          …
        </Typography>
      )}
    </>
  );
}

function TwoColumnRemediationPanel({
  yaml,
  highlightLine,
  rightLabel,
  rightContent,
}: {
  yaml: string;
  highlightLine: number;
  rightLabel: string;
  rightContent: ReactNode;
}) {
  const classes = useStyles();

  return (
    <div className={classes.diffPanels}>
      <div className={classes.diffPanel}>
        <div className={classes.diffPanelLabel}>Current</div>
        <Box padding={1}>
          <CurrentYamlPanel yaml={yaml} highlightLine={highlightLine} />
        </Box>
      </div>
      <div className={classes.diffPanel}>
        <div className={classes.diffPanelLabel}>{rightLabel}</div>
        <Box padding={1.5}>{rightContent}</Box>
      </div>
    </div>
  );
}

function hasSuggestedRemediation(v: Violation): boolean {
  return Boolean(
    v.fixed_yaml?.trim() ||
      v.ai_suggestion?.trim() ||
      v.message?.trim(),
  );
}

function ExpandedViolationDetail({
  violation: v,
  rowDiff,
  onDismiss,
}: {
  violation: Violation;
  rowDiff?: ViolationRowDiff;
  onDismiss: () => void;
}) {
  const classes = useStyles();
  const cat = v.category ? categoryLabel(v.category) : v.validator_source;

  let remediationBody: ReactNode;
  if (rowDiff?.before || rowDiff?.after) {
    remediationBody = (
      <div className={classes.diffPanels}>
        <div className={classes.diffPanel}>
          <div className={classes.diffPanelLabel}>Before</div>
          <Box padding={1}>
            <CodePreview yaml={rowDiff.before ?? ''} highlightLine={v.line} />
          </Box>
        </div>
        <div className={classes.diffPanel}>
          <div className={classes.diffPanelLabel}>After</div>
          <Box padding={1}>
            <CodePreview yaml={rowDiff.after ?? ''} highlightLine={v.line} />
          </Box>
        </div>
      </div>
    );
  } else if (v.fixed_yaml) {
    remediationBody = (
      <DiffView
        before={v.original_yaml}
        after={v.fixed_yaml}
        title="Proposed fix"
      />
    );
  } else if (v.original_yaml?.trim() && v.ai_suggestion?.trim()) {
    remediationBody = (
      <TwoColumnRemediationPanel
        yaml={v.original_yaml}
        highlightLine={v.line}
        rightLabel="Suggested change"
        rightContent={
          <Typography variant="body2" className={classes.suggestionPanel}>
            {v.ai_suggestion}
          </Typography>
        }
      />
    );
  } else if (v.original_yaml?.trim() && v.message?.trim()) {
    remediationBody = (
      <TwoColumnRemediationPanel
        yaml={v.original_yaml}
        highlightLine={v.line}
        rightLabel="Issues found"
        rightContent={
          <IssuesList issues={formatViolationMessage(v.message)} />
        }
      />
    );
  } else if (v.message?.trim()) {
    remediationBody = (
      <IssuesList issues={formatViolationMessage(v.message)} />
    );
  } else if (v.ai_suggestion?.trim()) {
    remediationBody = (
      <Typography variant="body2" className={classes.suggestionPanel}>
        {v.ai_suggestion}
      </Typography>
    );
  } else {
    remediationBody = (
      <Typography variant="body2" color="textSecondary">
        No automated suggestion for this rule — edit manually in your repo.
      </Typography>
    );
  }

  return (
    <Box padding={2}>
      <Typography variant="body2" className={classes.description}>
        {v.ai_reason || `Rule ${v.rule_id} detected in ${v.file}`}
      </Typography>
      <Typography
        variant="subtitle2"
        style={{ marginTop: 12, marginBottom: 8, fontSize: 13 }}
      >
        Suggested remediation
      </Typography>
      {remediationBody}
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
          <Tooltip title="Mark as reviewed — won't be included in fix suggestions.">
            <Button
              size="small"
              variant="text"
              style={{ fontSize: 12, color: '#6a6e73' }}
              onClick={onDismiss}
            >
              Dismiss
            </Button>
          </Tooltip>
        </div>
      </div>
    </Box>
  );
}

function fixMethodSortKey(remediationClass: number, enableAi: boolean): number {
  const ft = effectiveFixType(remediationClass, enableAi);
  if (ft === 'auto') return 0;
  if (ft === 'ai') return 1;
  if (ft === 'manual') return 2;
  return 3;
}

export interface ApmeViolationsTableProps {
  violations: Violation[];
  selectedIds?: Set<number>;
  onSelectionChange?: (ids: Set<number>) => void;
  toolbarActions?: ReactNode;
  /** Dev Spaces factory URL for manual violations (repo or remediation branch). */
  devSpacesUrl?: string | null;
  filterContext?: ApmeViolationsTableFilterContext;
  /** When false, hide row checkboxes (e.g. during push/PR). */
  showCheckboxes?: boolean;
  /** Use status chips (Proposed / Excluded / In PR) instead of tier chips. */
  fixChipMode?: 'tier' | 'status';
  getFixStatus?: (violationId: number) => FixChipStatus;
  /** Per-violation before/after diffs for review step. */
  rowDiffs?: Map<number, ViolationRowDiff>;
}

export const ApmeViolationsTable = ({
  violations,
  selectedIds,
  onSelectionChange,
  devSpacesUrl: _devSpacesUrl,
  toolbarActions,
  filterContext,
  showCheckboxes = true,
  fixChipMode = 'tier',
  getFixStatus,
  rowDiffs,
}: ApmeViolationsTableProps) => {
  const classes = useStyles();
  const enableAi = useApmeAiEnabled();
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
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

  const visible = useMemo(
    () => violations.filter(v => !dismissed.has(v.id)),
    [violations, dismissed],
  );

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
            fixMethodSortKey(a.remediation_class, enableAi) -
            fixMethodSortKey(b.remediation_class, enableAi);
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
  }, [visible, sortCol, sortAsc, enableAi]);

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
      const ft = effectiveFixType(v.remediation_class, enableAi);
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

  const handleDismiss = (id: number) => {
    setDismissed(prev => new Set([...prev, id]));
    const next = new Set(selected);
    next.delete(id);
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
        {showCheckboxes && (
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
            <th style={{ width: 40 }} />
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
            const isExpanded = isRowExpanded(v.id);
            const rowDiff = rowDiffs?.get(v.id);
            const fixStatus = getFixStatus?.(v.id) ?? 'proposed';

            return [
              <tr
                key={v.id}
                className="dataRow"
                onClick={() => toggleExpanded(v.id)}
              >
                <td
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => e.stopPropagation()}
                >
                  {showCheckboxes ? (
                    <Tooltip
                      title={
                        canSelect
                          ? 'Include in fix generation when checked'
                          : hasSuggestedRemediation(v)
                            ? 'Manual only — see suggested remediation below'
                            : 'Manual only — no automated suggestion'
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
                  ) : null}
                </td>
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
                  <FixChipStyled
                    remediationClass={v.remediation_class}
                    enableAi={enableAi}
                    mode={fixChipMode}
                    status={fixStatus}
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
                  <td colSpan={6} className={classes.expandedCell}>
                    <Collapse in={isExpanded}>
                      <ExpandedViolationDetail
                        violation={v}
                        rowDiff={rowDiff}
                        onDismiss={() => handleDismiss(v.id)}
                      />
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
