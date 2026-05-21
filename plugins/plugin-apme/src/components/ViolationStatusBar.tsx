import React from 'react';
import { Box, Typography } from '@material-ui/core';
import type { ViolationDetail } from '../types/api';
import { severityClass, SEVERITY_COLORS } from './severity';

interface Props {
  violations: ViolationDetail[];
}

export const ViolationStatusBar = ({ violations }: Props) => {
  const counts: Record<string, number> = {};
  for (const v of violations) {
    const cls = severityClass(v.level, v.rule_id);
    counts[cls] = (counts[cls] || 0) + 1;
  }
  const total = violations.length || 1;

  return (
    <Box>
      <Box
        display="flex"
        style={{ height: 8, borderRadius: 4, overflow: 'hidden' }}
      >
        {Object.entries(counts)
          .sort(
            ([a], [b]) =>
              (SEVERITY_COLORS[a] ? 0 : 1) - (SEVERITY_COLORS[b] ? 0 : 1),
          )
          .map(([cls, count]) => (
            <Box
              key={cls}
              style={{
                width: `${(count / total) * 100}%`,
                backgroundColor: SEVERITY_COLORS[cls] || '#6a6e73',
              }}
            />
          ))}
      </Box>
      <Box display="flex" style={{ gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
        {Object.entries(counts).map(([cls, count]) => (
          <Typography
            key={cls}
            variant="caption"
            style={{ color: SEVERITY_COLORS[cls] || '#6a6e73' }}
          >
            {cls}: {count}
          </Typography>
        ))}
      </Box>
    </Box>
  );
};
