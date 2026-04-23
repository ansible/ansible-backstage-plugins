import React, { useMemo, useState } from 'react';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import {
  ContentHeader,
  Progress,
  WarningPanel,
  Table,
  TableColumn,
} from '@backstage/core-components';
import { Link } from 'react-router-dom';
import { Box, TextField, Typography } from '@material-ui/core';
import { apmeApiRef } from '../api/ApmeApi';
import type {
  CollectionHealthSummary,
  CollectionSummary,
  DepHealthSummary,
} from '../types/api';
import { SEVERITY_COLORS } from '../components/severity';

type CollectionTableRow = CollectionSummary & {
  findings: number;
  findingsColor: string;
};

function healthByFqcn(
  dep: DepHealthSummary | undefined,
): Map<string, CollectionHealthSummary> {
  const m = new Map<string, CollectionHealthSummary>();
  if (!dep) return m;
  for (const c of dep.collection_findings) {
    m.set(c.fqcn, c);
  }
  return m;
}

function worstFindingColor(h: CollectionHealthSummary | undefined): {
  count: number;
  color: string;
} {
  if (!h || h.finding_count === 0) {
    return { count: 0, color: '#6a6e73' };
  }
  const order: (keyof Pick<
    CollectionHealthSummary,
    'critical' | 'error' | 'high' | 'medium' | 'low' | 'info'
  >)[] = ['critical', 'error', 'high', 'medium', 'low', 'info'];
  for (const sev of order) {
    if (h[sev] > 0) {
      return {
        count: h.finding_count,
        color: SEVERITY_COLORS[sev] ?? '#6a6e73',
      };
    }
  }
  return { count: h.finding_count, color: '#6a6e73' };
}

export const CollectionsPage = () => {
  const api = useApi(apmeApiRef);
  const { value, loading, error } = useAsync(() =>
    Promise.all([api.listCollections(), api.getDepHealthSummary()]),
  );
  const [fqcnFilter, setFqcnFilter] = useState('');

  const rows = useMemo((): CollectionTableRow[] => {
    if (!value) return [];
    const [collections, depHealth] = value;
    const hmap = healthByFqcn(depHealth);
    return (collections ?? []).map(c => {
      const hf = hmap.get(c.fqcn);
      const { count, color } = worstFindingColor(hf);
      return { ...c, findings: count, findingsColor: color };
    });
  }, [value]);

  const filtered = useMemo(() => {
    const q = fqcnFilter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.fqcn.toLowerCase().includes(q));
  }, [rows, fqcnFilter]);

  if (loading) return <Progress />;
  if (error)
    return (
      <WarningPanel title="Failed to load collections">
        {error.message}
      </WarningPanel>
    );

  const columns: TableColumn<CollectionTableRow>[] = [
    {
      title: 'FQCN',
      field: 'fqcn',
      customSort: (a, b) => a.fqcn.localeCompare(b.fqcn),
      render: row => (
        <Link to={`./${encodeURIComponent(row.fqcn)}`}>{row.fqcn}</Link>
      ),
    },
    {
      title: 'Version',
      field: 'version',
      customSort: (a, b) => a.version.localeCompare(b.version),
    },
    {
      title: 'Source',
      field: 'source',
      customSort: (a, b) => a.source.localeCompare(b.source),
    },
    {
      title: 'Project Count',
      field: 'project_count',
      type: 'numeric',
    },
    {
      title: 'Findings',
      field: 'findings',
      type: 'numeric',
      customSort: (a, b) => a.findings - b.findings,
      render: row => {
        if (row.findings === 0) {
          return (
            <Typography component="span" color="textSecondary">
              0
            </Typography>
          );
        }
        return (
          <Typography
            component="span"
            style={{ color: row.findingsColor, fontWeight: 600 }}
          >
            {row.findings}
          </Typography>
        );
      },
    },
  ];

  return (
    <>
      <ContentHeader title="Collections" />
      <Box mb={2} maxWidth={480}>
        <TextField
          label="Filter by FQCN"
          value={fqcnFilter}
          onChange={e => setFqcnFilter(e.target.value)}
          fullWidth
          margin="dense"
          variant="outlined"
        />
      </Box>
      <Table
        title="Ansible Collections"
        columns={columns as any}
        data={filtered}
        options={{
          sorting: true,
          paging: true,
          pageSize: 25,
          search: false,
        }}
      />
    </>
  );
};
