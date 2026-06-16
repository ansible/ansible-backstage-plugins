import { useMemo } from 'react';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import {
  ContentHeader,
  Progress,
  Table,
  TableColumn,
  WarningPanel,
} from '@backstage/core-components';
import { Box, Typography } from '@material-ui/core';
import { apmeApiRef } from '../api/ApmeApi';
import type { AiAcceptanceEntry, RuleDetail } from '../types/api';
import { severityColor } from '../components/severity';

const LIMIT = 20;

function aiRate(entry: AiAcceptanceEntry): string {
  const d = entry.approved + entry.rejected;
  if (d === 0) return '—';
  return `${((entry.approved / d) * 100).toFixed(1)}%`;
}

export const AnalyticsPage = () => {
  const api = useApi(apmeApiRef);
  const { value, loading, error } = useAsync(async () => {
    const [topViolations, remRates, aiAcceptance, rules] = await Promise.all([
      api.getTopViolations(LIMIT),
      api.getRemediationRates(LIMIT),
      api.getAiAcceptance(),
      api.listRules(),
    ]);
    return { topViolations, remRates, aiAcceptance, rules };
  }, [api]);

  const ruleById = useMemo(() => {
    const m = new Map<string, RuleDetail>();
    (value?.rules ?? []).forEach(r => m.set(r.rule_id, r));
    return m;
  }, [value?.rules]);

  const topViolations = value?.topViolations ?? [];
  const remRates = value?.remRates ?? [];
  const aiAcceptance = value?.aiAcceptance ?? [];

  const violationCols: TableColumn[] = [
    { title: 'Rule ID', field: 'rule_id' },
    {
      title: 'Description',
      render: (row: any) => {
        const r = ruleById.get(row.rule_id);
        const color = r ? severityColor(r.effective_severity) : 'inherit';
        return <span style={{ color }}>{r?.description ?? '—'}</span>;
      },
    },
    { title: 'Count', field: 'count', type: 'numeric' },
  ];

  const remCols: TableColumn[] = [
    { title: 'Rule ID', field: 'rule_id' },
    {
      title: 'Description',
      render: (row: any) => {
        const r = ruleById.get(row.rule_id);
        const color = r ? severityColor(r.effective_severity) : 'inherit';
        return <span style={{ color }}>{r?.description ?? '—'}</span>;
      },
    },
    { title: 'Fix count', field: 'fix_count', type: 'numeric' },
  ];

  const aiCols: TableColumn[] = [
    { title: 'Rule ID', field: 'rule_id' },
    {
      title: 'Description',
      render: (row: any) => {
        const r = ruleById.get(row.rule_id);
        const color = r ? severityColor(r.effective_severity) : 'inherit';
        return <span style={{ color }}>{r?.description ?? '—'}</span>;
      },
    },
    { title: 'Approved', field: 'approved', type: 'numeric' },
    { title: 'Rejected', field: 'rejected', type: 'numeric' },
    { title: 'Pending', field: 'pending', type: 'numeric' },
    {
      title: 'Rate',
      render: (row: any) => aiRate(row),
      type: 'numeric',
    },
    { title: 'Avg confidence', field: 'avg_confidence', type: 'numeric' },
  ];

  return (
    <>
      <ContentHeader title="Analytics" />
      {loading && <Progress />}
      {error && (
        <WarningPanel title="Failed to load analytics">
          {error.message}
        </WarningPanel>
      )}
      <Box display="flex" flexDirection="column" style={{ gap: 24 }}>
        <Box>
          <Typography variant="h6" gutterBottom>
            Top violations
          </Typography>
          <Table
            title=""
            columns={violationCols}
            data={topViolations}
            options={{ paging: false, search: false, toolbar: false }}
          />
        </Box>
        <Box>
          <Typography variant="h6" gutterBottom>
            Remediation rates
          </Typography>
          <Table
            title=""
            columns={remCols}
            data={remRates}
            options={{ paging: false, search: false, toolbar: false }}
          />
        </Box>
        <Box>
          <Typography variant="h6" gutterBottom>
            AI acceptance
          </Typography>
          <Table
            title=""
            columns={aiCols}
            data={aiAcceptance}
            options={{ paging: false, search: false, toolbar: false }}
          />
        </Box>
      </Box>
    </>
  );
};
