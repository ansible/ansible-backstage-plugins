import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { VariableSizeList } from 'react-window';
import { Box, Chip, Typography, makeStyles } from '@material-ui/core';
import type { FindingSeverity, MultiHostFinding } from '@ansible/backstage-compliance-common/types';
import { FindingCard } from './FindingCard';
import type { RuleSelection } from './FindingCard';

type RemediationScope = 'failed_only' | 'standardize_all';

export interface SectionHeaderItem {
  type: 'header';
  key: string;
  severity: FindingSeverity;
  label: string;
  count: number;
  enabledCount: number;
}

export interface FindingItem {
  type: 'finding';
  finding: MultiHostFinding;
}

export type ListItem = SectionHeaderItem | FindingItem;

const HEADER_HEIGHT = 48;
const DEFAULT_COLLAPSED_HEIGHT = 76;
const MIN_LIST_HEIGHT = 200;
const MAX_LIST_HEIGHT = 600;

const useStyles = makeStyles(theme => ({
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(1.5, 2),
    backgroundColor: theme.palette.action.hover,
    borderRadius: theme.shape.borderRadius,
  },
}));

interface VirtualizedFindingsListProps {
  items: ListItem[];
  selections: Record<string, RuleSelection>;
  onToggleFinding: (ruleId: string) => void;
  onToggleExpanded: (ruleId: string) => void;
  onSetScope: (ruleId: string, scope: RemediationScope) => void;
  onUpdateParameter: (ruleId: string, paramName: string, value: string | number | boolean) => void;
  cardClasses: Record<string, string>;
  getSeverityClass: (severity: FindingSeverity) => string;
  severityChipClass: string;
  listHeight?: number;
}

export const VirtualizedFindingsList: React.FC<VirtualizedFindingsListProps> = ({
  items,
  selections,
  onToggleFinding,
  onToggleExpanded,
  onSetScope,
  onUpdateParameter,
  cardClasses,
  getSeverityClass,
  severityChipClass,
  listHeight: listHeightProp,
}) => {
  const classes = useStyles();
  const listRef = useRef<VariableSizeList>(null);
  const heightCache = useRef(new Map<string, number>());
  const observerRefs = useRef(new Map<string, ResizeObserver>());
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const getItemSize = useCallback((index: number): number => {
    const item = itemsRef.current[index];
    if (!item || item.type === 'header') return HEADER_HEIGHT;
    const cached = heightCache.current.get(item.finding.ruleId);
    return cached ?? DEFAULT_COLLAPSED_HEIGHT;
  }, []);

  const itemsKey = useMemo(
    () => items.map(it => (it.type === 'header' ? it.key : it.finding.ruleId)).join(','),
    [items],
  );

  useEffect(() => {
    listRef.current?.resetAfterIndex(0, false);
  }, [itemsKey]);

  const prevExpandedRef = useRef(new Set<string>());
  useEffect(() => {
    const prev = prevExpandedRef.current;
    let minChangedIndex = items.length;

    items.forEach((item, idx) => {
      if (item.type !== 'finding') return;
      const rid = item.finding.ruleId;
      const wasExpanded = prev.has(rid);
      const isExpanded = selections[rid]?.expanded ?? false;
      if (wasExpanded !== isExpanded) {
        heightCache.current.delete(rid);
        if (idx < minChangedIndex) minChangedIndex = idx;
      }
    });

    const nextExpanded = new Set<string>();
    items.forEach(item => {
      if (item.type === 'finding' && selections[item.finding.ruleId]?.expanded) {
        nextExpanded.add(item.finding.ruleId);
      }
    });
    prevExpandedRef.current = nextExpanded;

    if (minChangedIndex < items.length && listRef.current) {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => {
        listRef.current?.resetAfterIndex(minChangedIndex, false);
      }, 50);
    }
  }, [items, selections]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      observerRefs.current.forEach(obs => obs.disconnect());
    };
  }, []);

  const measureRef = useCallback((node: HTMLDivElement | null, ruleId: string) => {
    if (!node) {
      const observer = observerRefs.current.get(ruleId);
      if (observer) {
        observer.disconnect();
        observerRefs.current.delete(ruleId);
      }
      return;
    }

    const existingObserver = observerRefs.current.get(ruleId);
    if (existingObserver) existingObserver.disconnect();

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const height = Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
      const prev = heightCache.current.get(ruleId);
      if (prev !== height && height > 0) {
        heightCache.current.set(ruleId, height);
        const currentItems = itemsRef.current;
        const idx = currentItems.findIndex(
          it => it.type === 'finding' && it.finding.ruleId === ruleId,
        );
        if (idx >= 0 && listRef.current) {
          if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
          resetTimerRef.current = setTimeout(() => {
            listRef.current?.resetAfterIndex(idx, false);
          }, 50);
        }
      }
    });

    observer.observe(node);
    observerRefs.current.set(ruleId, observer);
  }, []);

  const effectiveHeight = useMemo(() => {
    if (listHeightProp) return listHeightProp;
    let totalHeight = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type === 'header') {
        totalHeight += HEADER_HEIGHT;
      } else {
        totalHeight += heightCache.current.get(item.finding.ruleId) ?? DEFAULT_COLLAPSED_HEIGHT;
      }
    }
    return Math.max(MIN_LIST_HEIGHT, Math.min(MAX_LIST_HEIGHT, totalHeight));
  }, [items, listHeightProp]);

  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const item = items[index];

    if (item.type === 'header') {
      return (
        <div style={style}>
          <div className={classes.sectionHeader}>
            <Box display="flex" alignItems="center" style={{ gap: 8 }}>
              <Chip
                label={item.label}
                size="small"
                className={`${severityChipClass} ${getSeverityClass(item.severity)}`}
                style={{ fontWeight: 600 }}
              />
              <Typography variant="caption" color="textSecondary">
                {item.enabledCount}/{item.count} selected
              </Typography>
            </Box>
          </div>
        </div>
      );
    }

    const sel = selections[item.finding.ruleId];
    if (!sel) return <div style={style} />;

    return (
      <div style={style}>
        <div ref={node => measureRef(node, item.finding.ruleId)}>
          <FindingCard
            finding={item.finding}
            selection={sel}
            onToggle={onToggleFinding}
            onToggleExpand={onToggleExpanded}
            onSetScope={onSetScope}
            onUpdateParameter={onUpdateParameter}
            classes={cardClasses}
            getSeverityClass={getSeverityClass}
          />
        </div>
      </div>
    );
  }, [items, selections, classes, severityChipClass, getSeverityClass, onToggleFinding, onToggleExpanded, onSetScope, onUpdateParameter, cardClasses, measureRef]);

  if (items.length === 0) return null;

  return (
    <VariableSizeList
      ref={listRef}
      height={effectiveHeight}
      itemCount={items.length}
      itemSize={getItemSize}
      width="100%"
      overscanCount={3}
      itemKey={index => {
        const item = items[index];
        return item.type === 'header' ? item.key : item.finding.ruleId;
      }}
    >
      {Row}
    </VariableSizeList>
  );
};
