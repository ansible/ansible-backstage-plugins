import React from 'react';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { Content, ContentHeader, Progress, WarningPanel, Table, TableColumn } from '@backstage/core-components';
import { apmeApiRef } from '../api/ApmeApi';

export const AnalyticsPage = () => {
  const api = useApi(apmeApiRef);
  const { value: topViolations, loading: tvLoad, error: tvErr } = useAsync(() => api.getTopViolations());
  const { value: remRates } = useAsync(() => api.getRemediationRates());
  const { value: aiAcceptance } = useAsync(() => api.getAiAcceptance());

  if (tvLoad) return <Progress />;
  if (tvErr) return <WarningPanel title="Failed to load analytics">{tvErr.message}</WarningPanel>;

  const violationCols: TableColumn[] = [
    { title: 'Rule ID', field: 'rule_id' },
    { title: 'Count', field: 'count', type: 'numeric' },
  ];
  const remCols: TableColumn[] = [
    { title: 'Rule ID', field: 'rule_id' },
    { title: 'Fix Count', field: 'fix_count', type: 'numeric' },
  ];
  const aiCols: TableColumn[] = [
    { title: 'Rule ID', field: 'rule_id' },
    { title: 'Approved', field: 'approved', type: 'numeric' },
    { title: 'Rejected', field: 'rejected', type: 'numeric' },
    { title: 'Pending', field: 'pending', type: 'numeric' },
    { title: 'Avg Confidence', field: 'avg_confidence', type: 'numeric' },
  ];

  return (
    <Content>
      <ContentHeader title="Analytics" />
      <Table title="Top Violations" columns={violationCols} data={topViolations ?? []} options={{ paging: false, search: false }} />
      <Table title="Remediation Rates" columns={remCols} data={remRates ?? []} options={{ paging: false, search: false }} />
      <Table title="AI Acceptance" columns={aiCols} data={aiAcceptance ?? []} options={{ paging: false, search: false }} />
    </Content>
  );
};
