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
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Table as MuiTable,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { apmeApiRef } from '../api/ApmeApi';
import type {
  DepHealthSummary,
  PythonCveSummary,
  PythonPackageSummary,
} from '../types/api';
import {
  SEVERITY_COLORS,
  severityClass,
  severityColor,
  severityOrder,
} from '../components/severity';

type PackageRow = PythonPackageSummary & {
  cveCount: number;
  cveCountColor: string;
};

function aggregateCveBySeverity(
  pythonCves: PythonCveSummary[],
): { key: string; count: number; color: string }[] {
  const bucketSums: Record<string, number> = {};
  for (const c of pythonCves) {
    const k = severityClass(c.level, c.rule_id);
    bucketSums[k] = (bucketSums[k] ?? 0) + c.occurrence_count;
  }
  const order = ['critical', 'error', 'high', 'medium', 'low', 'info'] as const;
  return order
    .map(key => {
      const count = bucketSums[key] ?? 0;
      if (count === 0) return null;
      return { key, count, color: SEVERITY_COLORS[key] };
    })
    .filter(Boolean) as { key: string; count: number; color: string }[];
}

function cveStatsForPackage(
  name: string,
  cves: PythonCveSummary[],
): { cveCount: number; cveCountColor: string } {
  const n = name.toLowerCase();
  const matched = cves.filter(
    cve =>
      cve.message.toLowerCase().includes(n) ||
      cve.rule_id.toLowerCase().includes(n),
  );
  const cveCount = matched.reduce((s, c) => s + c.occurrence_count, 0);
  if (matched.length === 0) {
    return { cveCount: 0, cveCountColor: '#6a6e73' };
  }
  let worst: string = 'info';
  for (const c of matched) {
    const cls = severityClass(c.level, c.rule_id);
    if (severityOrder(cls) < severityOrder(worst)) {
      worst = cls;
    }
  }
  return { cveCount, cveCountColor: SEVERITY_COLORS[worst] ?? '#6a6e73' };
}

export const PythonPackagesPage = () => {
  const api = useApi(apmeApiRef);
  const { value, loading, error } = useAsync(() =>
    Promise.all([api.listPythonPackages(), api.getDepHealthSummary()]),
  );
  const [nameFilter, setNameFilter] = useState('');

  const { packageRows, depHealth } = useMemo(() => {
    if (!value) {
      return {
        packageRows: [] as PackageRow[],
        depHealth: undefined as DepHealthSummary | undefined,
      };
    }
    const [packages, health] = value;
    const cves = health.python_cves ?? [];
    const rows: PackageRow[] = (packages ?? []).map(p => {
      const { cveCount, cveCountColor } = cveStatsForPackage(p.name, cves);
      return { ...p, cveCount, cveCountColor };
    });
    return { packageRows: rows, depHealth: health };
  }, [value]);

  const cveStrip = useMemo(
    () => (depHealth ? aggregateCveBySeverity(depHealth.python_cves) : []),
    [depHealth],
  );
  const pythonCves = depHealth?.python_cves ?? [];

  const filtered = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    if (!q) return packageRows;
    return packageRows.filter(p => p.name.toLowerCase().includes(q));
  }, [packageRows, nameFilter]);

  if (loading) return <Progress />;
  if (error)
    return (
      <WarningPanel title="Failed to load packages">
        {error.message}
      </WarningPanel>
    );

  const columns: TableColumn<PackageRow>[] = [
    {
      title: 'Name',
      field: 'name',
      customSort: (a, b) => a.name.localeCompare(b.name),
      render: row => (
        <Link to={`./${encodeURIComponent(row.name)}`}>{row.name}</Link>
      ),
    },
    {
      title: 'Version',
      field: 'version',
      customSort: (a, b) => a.version.localeCompare(b.version),
    },
    {
      title: 'Project Count',
      field: 'project_count',
      type: 'numeric',
    },
    {
      title: 'CVEs',
      field: 'cveCount',
      type: 'numeric',
      customSort: (a, b) => a.cveCount - b.cveCount,
      render: row => {
        if (row.cveCount === 0) {
          return (
            <Typography component="span" color="textSecondary">
              0
            </Typography>
          );
        }
        return (
          <Typography
            component="span"
            style={{ color: row.cveCountColor, fontWeight: 600 }}
          >
            {row.cveCount}
          </Typography>
        );
      },
    },
  ];

  return (
    <>
      <ContentHeader title="Python Packages" />
      {cveStrip.length > 0 && (
        <Box
          mb={2}
          display="flex"
          flexWrap="wrap"
          alignItems="center"
          style={{ gap: 8 }}
        >
          <Typography variant="subtitle2" component="span">
            CVEs by severity (occurrences):
          </Typography>
          {cveStrip.map(s => (
            <Chip
              key={s.key}
              size="small"
              label={`${s.key}: ${s.count}`}
              style={{ backgroundColor: s.color, color: '#fff' }}
            />
          ))}
        </Box>
      )}
      {pythonCves.length > 0 && (
        <Accordion defaultExpanded={false} style={{ marginBottom: 16 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>All python CVEs ({pythonCves.length})</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <MuiTable size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Rule ID</TableCell>
                  <TableCell>Level</TableCell>
                  <TableCell>Message</TableCell>
                  <TableCell align="right">Occurrence count</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pythonCves.map((cve, i) => (
                  <TableRow key={`${cve.rule_id}-${i}`}>
                    <TableCell>{cve.rule_id}</TableCell>
                    <TableCell>
                      <span
                        style={{ color: severityColor(cve.level, cve.rule_id) }}
                      >
                        {cve.level}
                      </span>
                    </TableCell>
                    <TableCell>{cve.message}</TableCell>
                    <TableCell align="right">{cve.occurrence_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </MuiTable>
          </AccordionDetails>
        </Accordion>
      )}
      <Box mb={2} maxWidth={480}>
        <TextField
          label="Filter by package name"
          value={nameFilter}
          onChange={e => setNameFilter(e.target.value)}
          fullWidth
          margin="dense"
          variant="outlined"
        />
      </Box>
      <Table
        title="Python dependencies"
        columns={columns as any}
        data={filtered}
        options={{ sorting: true, paging: true, pageSize: 25, search: false }}
      />
    </>
  );
};
