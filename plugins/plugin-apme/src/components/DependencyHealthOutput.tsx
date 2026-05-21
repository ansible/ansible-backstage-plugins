import React from 'react';
import { Box, Card, CardContent, Chip, Typography } from '@material-ui/core';
import type { DepHealthSummary } from '../types/api';
import { SEVERITY_COLORS } from './severity';

interface Props {
  depHealth: DepHealthSummary;
}

export const DependencyHealthOutput = ({ depHealth }: Props) => {
  const { collection_findings, python_cves } = depHealth;

  if (collection_findings.length === 0 && python_cves.length === 0) {
    return (
      <Typography color="textSecondary">
        No dependency health findings.
      </Typography>
    );
  }

  return (
    <Box>
      {python_cves.length > 0 && (
        <Card variant="outlined" style={{ marginBottom: 16 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>
              Python CVEs ({python_cves.length})
            </Typography>
            <Box
              display="flex"
              style={{ gap: 8, flexWrap: 'wrap', marginBottom: 8 }}
            >
              {(
                ['critical', 'error', 'high', 'medium', 'low', 'info'] as const
              ).map(sev => {
                const count = python_cves.filter(
                  c => c.level.toLowerCase() === sev,
                ).length;
                if (count === 0) return null;
                return (
                  <Chip
                    key={sev}
                    size="small"
                    label={`${sev}: ${count}`}
                    style={{
                      backgroundColor: SEVERITY_COLORS[sev],
                      color: '#fff',
                    }}
                  />
                );
              })}
            </Box>
            {python_cves.map((cve, i) => (
              <Box
                key={i}
                style={{ padding: '4px 0', borderBottom: '1px solid #e0e0e0' }}
              >
                <Typography variant="body2">
                  <Chip
                    size="small"
                    label={cve.level}
                    style={{
                      marginRight: 8,
                      backgroundColor:
                        SEVERITY_COLORS[cve.level.toLowerCase()] || '#6a6e73',
                      color: '#fff',
                    }}
                  />
                  {cve.rule_id}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  {cve.message} ({cve.occurrence_count} occurrences)
                </Typography>
              </Box>
            ))}
          </CardContent>
        </Card>
      )}
      {collection_findings.length > 0 && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>
              Collection Findings ({collection_findings.length})
            </Typography>
            {collection_findings.map((cf, i) => (
              <Box
                key={i}
                style={{ padding: '4px 0', borderBottom: '1px solid #e0e0e0' }}
              >
                <Typography variant="body2">
                  {cf.fqcn} — {cf.finding_count} findings
                </Typography>
                <Box display="flex" style={{ gap: 4 }}>
                  {cf.critical > 0 && (
                    <Chip
                      size="small"
                      label={`C:${cf.critical}`}
                      style={{
                        backgroundColor: SEVERITY_COLORS.critical,
                        color: '#fff',
                      }}
                    />
                  )}
                  {cf.error > 0 && (
                    <Chip
                      size="small"
                      label={`E:${cf.error}`}
                      style={{
                        backgroundColor: SEVERITY_COLORS.error,
                        color: '#fff',
                      }}
                    />
                  )}
                  {cf.high > 0 && (
                    <Chip
                      size="small"
                      label={`H:${cf.high}`}
                      style={{
                        backgroundColor: SEVERITY_COLORS.high,
                        color: '#fff',
                      }}
                    />
                  )}
                  {cf.medium > 0 && (
                    <Chip
                      size="small"
                      label={`M:${cf.medium}`}
                      style={{
                        backgroundColor: SEVERITY_COLORS.medium,
                        color: '#fff',
                      }}
                    />
                  )}
                  {cf.low > 0 && (
                    <Chip
                      size="small"
                      label={`L:${cf.low}`}
                      style={{
                        backgroundColor: SEVERITY_COLORS.low,
                        color: '#fff',
                      }}
                    />
                  )}
                </Box>
              </Box>
            ))}
          </CardContent>
        </Card>
      )}
    </Box>
  );
};
