import React, { useCallback, useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  ContentHeader,
  Progress,
  WarningPanel,
} from '@backstage/core-components';
import { Link } from 'react-router-dom';
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TablePagination,
} from '@material-ui/core';
import { apmeApiRef } from '../api/ApmeApi';
import { timeAgo } from '../components/format';
import type { SessionSummary } from '../types/api';

const PAGE_SIZE = 20;

export const SessionsPage = () => {
  const api = useApi(apmeApiRef);
  const [items, setItems] = useState<SessionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSessions = useCallback(() => {
    setLoading(true);
    setError(null);
    const offset = page * PAGE_SIZE;
    api
      .listSessions(PAGE_SIZE, offset)
      .then(data => {
        setItems(data?.items ?? []);
        setTotal(data?.total ?? 0);
      })
      .catch(e => {
        setItems([]);
        setTotal(0);
        setError(e instanceof Error ? e : new Error('Failed to load sessions'));
      })
      .finally(() => setLoading(false));
  }, [api, page]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  if (loading) return <Progress />;
  if (error) {
    return (
      <WarningPanel title="Failed to load sessions">
        {error.message}
        <Box mt={1}>
          <Button color="primary" onClick={fetchSessions}>
            Retry
          </Button>
        </Box>
      </WarningPanel>
    );
  }

  return (
    <>
      <ContentHeader
        title="Sessions"
        description="CLI sessions grouped by project path"
      />
      {items.length === 0 && total === 0 ? (
        <Box p={2} color="textSecondary">
          No sessions recorded yet. Sessions are created when the CLI scans a
          project.
        </Box>
      ) : (
        <>
          <TableContainer component={Paper}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Session ID</TableCell>
                  <TableCell>Project path</TableCell>
                  <TableCell>First seen</TableCell>
                  <TableCell>Last seen</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map(s => (
                  <TableRow key={s.session_id} hover>
                    <TableCell>
                      <Link
                        to={`./${s.session_id}`}
                        style={{ fontFamily: 'monospace', fontSize: 13 }}
                      >
                        {s.session_id.length > 12
                          ? `${s.session_id.slice(0, 12)}…`
                          : s.session_id}
                      </Link>
                    </TableCell>
                    <TableCell
                      style={{ fontFamily: 'monospace', fontSize: 13 }}
                    >
                      {s.project_path}
                    </TableCell>
                    <TableCell style={{ opacity: 0.85 }}>
                      {timeAgo(s.first_seen)}
                    </TableCell>
                    <TableCell style={{ opacity: 0.85 }}>
                      {timeAgo(s.last_seen)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {total > PAGE_SIZE && (
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={PAGE_SIZE}
              rowsPerPageOptions={[PAGE_SIZE]}
              backIconButtonProps={{ 'aria-label': 'previous page' } as object}
              nextIconButtonProps={{ 'aria-label': 'next page' } as object}
            />
          )}
        </>
      )}
    </>
  );
};
