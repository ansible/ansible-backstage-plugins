import React, { useCallback, useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  scaffolderApiRef,
  ScaffolderTask,
} from '@backstage/plugin-scaffolder-react';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
// eslint-disable-next-line no-restricted-imports
import { TablePaginationActionsProps } from '@mui/material/TablePagination/TablePaginationActions';
import IconButton from '@mui/material/IconButton';
import { KeyboardArrowLeft, KeyboardArrowRight } from '@mui/icons-material';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import BlockIcon from '@mui/icons-material/Block';
import { useNavigate } from 'react-router-dom';
import Link from '@mui/material/Link';
import { Content, Page } from '@backstage/core-components';
import Button from '@mui/material/Button';
import { SelectMenuProps } from '../../helpers/SelectMenuProps';
import { HeaderWithBreadcrumbs } from '../catalog/HeaderWithBreadcrumbs';

type Filters = {
  owner: 'all' | 'owned' | undefined;
};

function TablePaginationActions(props: TablePaginationActionsProps) {
  const { count, page, rowsPerPage, onPageChange } = props;

  const handleFirstPageButtonClick = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    onPageChange(event, 0);
  };

  const handleBackButtonClick = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    onPageChange(event, page - 1);
  };

  const handleNextButtonClick = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    onPageChange(event, page + 1);
  };

  const handleLastPageButtonClick = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    onPageChange(event, Math.max(0, Math.ceil(count / rowsPerPage) - 1));
  };

  return (
    <Box sx={{ flexShrink: 0, ml: 2.5 }}>
      <IconButton
        onClick={handleFirstPageButtonClick}
        disabled={page === 0}
        aria-label="first page"
      >
        <FirstPageIcon />
      </IconButton>
      <IconButton
        onClick={handleBackButtonClick}
        disabled={page === 0}
        aria-label="previous page"
      >
        <KeyboardArrowLeft />
      </IconButton>
      <IconButton
        onClick={handleNextButtonClick}
        disabled={page >= Math.ceil(count / rowsPerPage) - 1}
        aria-label="next page"
      >
        <KeyboardArrowRight />
      </IconButton>
      <IconButton
        onClick={handleLastPageButtonClick}
        disabled={page >= Math.ceil(count / rowsPerPage) - 1}
        aria-label="last page"
      >
        <LastPageIcon />
      </IconButton>
    </Box>
  );
}

export const MyItems = () => {
  const scaffolderApi = useApi(scaffolderApiRef);
  const [tasks, setTasks] = useState<ScaffolderTask[]>([]);
  const [totalTasks, setTotalTasks] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const [filters, setFilters] = useState<Filters>({
    owner: undefined,
  });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const fetchTasks = useCallback(async () => {
    if (!scaffolderApi?.listTasks) {
      setError(new Error('listTasks method is not available on scaffolderApi'));
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const response = await scaffolderApi.listTasks({
        filterByOwnership: filters.owner ?? 'all',
        limit: rowsPerPage,
        offset: page * rowsPerPage,
      });
      setTasks(response.tasks);
      setTotalTasks(response.totalTasks ? Number(response.totalTasks) : 0);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [filters, page, rowsPerPage, scaffolderApi]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleFilterChange = (
    key: keyof Filters,
    value: 'all' | 'owned' | undefined, // Ensure the value matches the allowed types
  ) => {
    setFilters(prevFilters => ({
      ...prevFilters,
      [key]: value,
    }));
    setPage(0);
  };

  const handlePageChange = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleRowsPerPageChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const formatCustomDate = (isoString: string) => {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: true,
    }).format(date);
  };

  const navigate = useNavigate();
  const navigateToItemDetails = (
    name?: string,
    namespace: string = 'default',
  ) => {
    if (!name) {
      return;
    }
    navigate(`/wizard/my-items/${namespace}/${name}`);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'failed':
        return <ErrorOutlineIcon sx={{ color: 'red' }} />;
      case 'completed':
        return <CheckCircleOutlineIcon sx={{ color: 'green' }} />;
      case 'processing':
        return <PlayCircleOutlineIcon sx={{ color: 'blue' }} />;
      case 'open':
        return <AddCircleOutlineIcon sx={{ color: 'blue' }} />;
      case 'cancelled':
        return <BlockIcon sx={{ color: 'yellow' }} />;
      default:
        return <></>;
    }
  };

  return (
    <Page themeId="tool">
      <HeaderWithBreadcrumbs
        title="My items"
        description="All tasks that have been started"
        breadcrumbs={[]}
        showStar={false}
      />
      <Content>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={12} md={4} lg={2}>
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
            >
              <h2>Filters</h2>
              <Button
                variant="text"
                color="primary"
                onClick={() => setFilters({ owner: undefined })}
              >
                Clear all
              </Button>
            </Box>
            <hr />
            <Box component="form" display="flex" flexDirection="column" p={0}>
              <FormControl fullWidth margin="normal">
                <Box mt={2} mb={1} display="flex" justifyContent="flex-start">
                  <Typography variant="body2" style={{ fontWeight: 'bold' }}>
                    Owner
                  </Typography>
                </Box>
                <Select
                  variant="outlined"
                  MenuProps={SelectMenuProps}
                  value={filters.owner ?? ''}
                  onChange={e => {
                    const value = e.target.value;
                    // Narrow the value to the expected type
                    if (
                      value === 'all' ||
                      value === 'owned' ||
                      value === undefined
                    ) {
                      handleFilterChange('owner', value || undefined);
                    } else {
                      // Handle the case where the value is invalid
                      console.warn('Invalid filter owner value:', value); // eslint-disable-line no-console
                    }
                  }}
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="owned">My</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Grid>
          <Grid item xs={12} sm={12} md={8} lg={10}>
            {loading && <Typography variant="body1">Loading...</Typography>}
            {!loading && error && (
              <Typography color="error" variant="body1">
                Error: {error.message}
              </Typography>
            )}
            {!loading && !error && (
              <Box>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Created at</TableCell>
                        <TableCell>Owner</TableCell>
                        <TableCell>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tasks.map(task => (
                        <TableRow key={task.id}>
                          <TableCell>
                            <Link
                              component="button"
                              variant="body2"
                              onClick={() =>
                                navigateToItemDetails(
                                  task.spec?.templateInfo?.entity?.metadata
                                    ?.name,
                                  task.spec?.templateInfo?.entity?.metadata
                                    ?.namespace,
                                )
                              }
                              style={{ textDecoration: 'none' }}
                            >
                              {task.spec?.templateInfo?.entity?.metadata
                                ?.title || 'Untitled'}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {formatCustomDate(task.createdAt)}
                          </TableCell>
                          <TableCell>
                            {task.spec?.user?.entity?.metadata?.title}
                          </TableCell>
                          <TableCell
                            sx={{
                              textTransform: 'capitalize',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <Box
                              sx={{
                                marginRight: 1,
                                display: 'flex',
                                alignItems: 'center',
                              }}
                            >
                              {getStatusIcon(task.status)}
                            </Box>{' '}
                            {task.status}
                          </TableCell>
                        </TableRow>
                      ))}
                      {totalTasks === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} align="center">
                            No tasks found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={totalTasks}
                  page={page}
                  onPageChange={handlePageChange}
                  rowsPerPage={rowsPerPage}
                  onRowsPerPageChange={handleRowsPerPageChange}
                  ActionsComponent={TablePaginationActions}
                />
              </Box>
            )}
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
