/*
 * Copyright Red Hat
 */

import { useMemo } from 'react';
import { Box, Typography, makeStyles } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  root: {
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
    fontSize: 12,
    borderRadius: theme.shape.borderRadius,
    overflow: 'auto',
    border: `1px solid ${theme.palette.divider}`,
  },
  title: {
    padding: theme.spacing(0.75, 1.5),
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor:
      theme.palette.type === 'dark' ? 'rgba(255,255,255,0.04)' : '#f5f5f5',
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: theme.palette.text.secondary,
  },
  line: {
    display: 'flex',
    alignItems: 'stretch',
    minHeight: 20,
    lineHeight: '20px',
  },
  lineNumber: {
    width: 36,
    textAlign: 'right',
    padding: '0 6px',
    color: theme.palette.text.disabled,
    userSelect: 'none',
    flexShrink: 0,
    borderRight: `1px solid ${theme.palette.divider}`,
    fontSize: 11,
  },
  linePrefix: {
    width: 18,
    textAlign: 'center',
    flexShrink: 0,
    userSelect: 'none',
    fontWeight: 700,
  },
  lineContent: {
    padding: '0 8px',
    whiteSpace: 'pre',
    flex: 1,
  },
  added: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(46, 160, 67, 0.15)'
        : 'rgba(46, 160, 67, 0.10)',
    '& $linePrefix': { color: '#2ea043' },
    '& $lineNumber': {
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(46, 160, 67, 0.10)'
          : 'rgba(46, 160, 67, 0.06)',
    },
  },
  removed: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(248, 81, 73, 0.15)'
        : 'rgba(248, 81, 73, 0.10)',
    '& $linePrefix': { color: '#f85149' },
    '& $lineNumber': {
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(248, 81, 73, 0.10)'
          : 'rgba(248, 81, 73, 0.06)',
    },
  },
  context: {
    backgroundColor:
      theme.palette.type === 'dark' ? 'rgba(255,255,255,0.02)' : '#fafafa',
  },
}));

function diffLineClassName(
  classes: ReturnType<typeof useStyles>,
  lineType: DiffLine['type'],
): string {
  if (lineType === 'added') return classes.added;
  if (lineType === 'removed') return classes.removed;
  return classes.context;
}

interface DiffLine {
  type: 'added' | 'removed' | 'context';
  content: string;
  oldNum?: number;
  newNum?: number;
}

function parseUnifiedDiffHunk(diff: string): DiffLine[] {
  const result: DiffLine[] = [];
  let oldNum = 0;
  let newNum = 0;

  for (const raw of diff.split('\n')) {
    if (!raw && result.length > 0) {
      continue;
    }
    if (raw.startsWith('@@')) {
      const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldNum = Number.parseInt(match[1], 10);
        newNum = Number.parseInt(match[2], 10);
      }
      result.push({ type: 'context', content: raw });
      continue;
    }
    if (raw.startsWith('+++') || raw.startsWith('---')) {
      result.push({ type: 'context', content: raw });
      continue;
    }
    if (raw.startsWith('+')) {
      result.push({
        type: 'added',
        content: raw.slice(1),
        newNum: newNum > 0 ? newNum : undefined,
      });
      if (newNum > 0) {
        newNum += 1;
      }
      continue;
    }
    if (raw.startsWith('-')) {
      result.push({
        type: 'removed',
        content: raw.slice(1),
        oldNum: oldNum > 0 ? oldNum : undefined,
      });
      if (oldNum > 0) {
        oldNum += 1;
      }
      continue;
    }
    const content = raw.startsWith(' ') ? raw.slice(1) : raw;
    result.push({
      type: 'context',
      content,
      oldNum: oldNum > 0 ? oldNum : undefined,
      newNum: newNum > 0 ? newNum : undefined,
    });
    if (oldNum > 0) {
      oldNum += 1;
    }
    if (newNum > 0) {
      newNum += 1;
    }
  }

  return result;
}

const MAX_DIFF_LINES = 2000;

function computeUnifiedDiff(before: string, after: string): DiffLine[] {
  const oldLines = before.split('\n');
  const newLines = after.split('\n');

  const n = oldLines.length;
  const m = newLines.length;

  if (n > MAX_DIFF_LINES || m > MAX_DIFF_LINES) {
    return [
      ...oldLines.map((l, idx) => ({
        type: 'removed' as const,
        content: l,
        lineNumber: idx + 1,
      })),
      ...newLines.map((l, idx) => ({
        type: 'added' as const,
        content: l,
        lineNumber: idx + 1,
      })),
    ];
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = n;
  let j = m;
  const stack: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({
        type: 'context',
        content: oldLines[i - 1],
        oldNum: i,
        newNum: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: 'added', content: newLines[j - 1], newNum: j });
      j--;
    } else {
      stack.push({ type: 'removed', content: oldLines[i - 1], oldNum: i });
      i--;
    }
  }
  while (stack.length > 0) {
    result.push(stack.pop()!);
  }
  return result;
}

export interface DiffViewProps {
  before?: string;
  after?: string;
  /** Unified diff from the gateway (`diff_hunk`). Takes precedence over before/after. */
  diff?: string;
  title?: string;
}

export const DiffView = ({ before, after, diff, title }: DiffViewProps) => {
  const classes = useStyles();

  const lines = useMemo(() => {
    if (diff?.trim()) {
      return parseUnifiedDiffHunk(diff);
    }
    if (before && after) return computeUnifiedDiff(before, after);
    if (before)
      return before.split('\n').map((c, i): DiffLine => ({
        type: 'removed',
        content: c,
        oldNum: i + 1,
      }));
    if (after)
      return after.split('\n').map((c, i): DiffLine => ({
        type: 'added',
        content: c,
        newNum: i + 1,
      }));
    return [];
  }, [before, after, diff]);

  if (lines.length === 0) return null;

  const prefixChar = (type: DiffLine['type']) => {
    if (type === 'added') return '+';
    if (type === 'removed') return '\u2212'; // minus sign
    return ' ';
  };

  return (
    <Box className={classes.root}>
      {title && <Typography className={classes.title}>{title}</Typography>}
      {lines.map((line, idx) => (
        <div
          key={idx}
          className={`${classes.line} ${diffLineClassName(classes, line.type)}`}
        >
          <span className={classes.lineNumber}>{line.oldNum ?? ''}</span>
          <span className={classes.lineNumber}>{line.newNum ?? ''}</span>
          <span className={classes.linePrefix}>{prefixChar(line.type)}</span>
          <span className={classes.lineContent}>{line.content}</span>
        </div>
      ))}
    </Box>
  );
};
