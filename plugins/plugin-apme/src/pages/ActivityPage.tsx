import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  ContentHeader,
  Progress,
  WarningPanel,
  Table,
  TableColumn,
} from '@backstage/core-components';
import { Box, Chip, TablePagination, Typography } from '@material-ui/core';
import { Link } from 'react-router-dom';
import { apmeApiRef } from '../api/ApmeApi';
import type { ActivitySummary } from '../types/api';
import { timeAgo } from '../components/format';

const PAGE_SIZE = 20;

export const ActivityPage = () => {
  const api = useApi(apmeApiRef);
  const [items, setItems] = useState<ActivitySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(
    (nextOffset: number) => {
      setLoading(true);
      setError(null);
      return api
        .listActivity(PAGE_SIZE, nextOffset)
        .then(res => {
          setItems(res.items);
          setTotal(res.total);
          setOffset(res.offset);
        })
        .catch(e => {
          setError(e instanceof Error ? e : new Error(String(e)));
        })
        .finally(() => {
          setLoading(false);
        });
    },
    [api],
  );

  useEffect(() => {
    load(0);
  }, [load]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        load(offset);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load, offset]);

  const onChangePage = useCallback(
    (_: React.MouseEvent<HTMLButtonElement> | null, nextPage: number) => {
      load(nextPage * PAGE_SIZE);
    },
    [load],
  );

  if (loading && items.length === 0) return <Progress />;
  if (error)
    return (
      <WarningPanel title="Failed to load activity">
        {error.message}
      </WarningPanel>
    );

  const page = Math.floor(offset / PAGE_SIZE);

  const columns: TableColumn<ActivitySummary>[] = [
    {
      title: 'Type',
      render: (row: any) => (
        <Box
          display="flex"
          alignItems="center"
          style={{ gap: 8, flexWrap: 'wrap' }}
        >
          <Chip label={row.scan_type} size="small" variant="outlined" />
          <Link to={row.scan_id}>
            <Typography component="span" variant="body2" color="primary">
              {row.scan_id.slice(0, 8)}…
            </Typography>
          </Link>
        </Box>
      ),
    },
    { title: 'Project path', field: 'project_path' },
    { title: 'Violations', field: 'total_violations', type: 'numeric' },
    { title: 'Fixable', field: 'fixable', type: 'numeric' },
    { title: 'Remediated', field: 'remediated_count', type: 'numeric' },
    {
      title: 'Created',
      render: (row: any) => timeAgo(row.created_at),
    },
  ];

  return (
    <>
      <ContentHeader title="Activity" />
      {loading && items.length > 0 ? (
        <Typography
          variant="caption"
          color="textSecondary"
          style={{ paddingLeft: 8 }}
        >
          Refreshing…
        </Typography>
      ) : null}
      <Table
        title="Scan history"
        columns={columns as any}
        data={items}
        options={{ paging: false, search: true }}
      />
      <Box display="flex" justifyContent="flex-end" mt={1}>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={onChangePage}
          rowsPerPage={PAGE_SIZE}
          rowsPerPageOptions={[PAGE_SIZE]}
        />
      </Box>
    </>
  );
};
