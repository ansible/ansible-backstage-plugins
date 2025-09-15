import { useCallback, useEffect, useState } from 'react';
import {
  identityApiRef,
  useApi,
  useRouteRef,
} from '@backstage/core-plugin-api';
import {
  scaffolderApiRef,
  ScaffolderTask,
} from '@backstage/plugin-scaffolder-react';
import { TablePaginationActionsProps } from '@material-ui/core/TablePagination/TablePaginationActions';
import { useNavigate } from 'react-router-dom';
import { Content, Header, Page } from '@backstage/core-components';
import {
  Box,
  Grid,
  IconButton,
  Link,
  makeStyles,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@material-ui/core';
import FirstPageIcon from '@material-ui/icons/FirstPage';
import KeyboardArrowLeft from '@material-ui/icons/KeyboardArrowLeft';
import KeyboardArrowRight from '@material-ui/icons/KeyboardArrowRight';
import LastPageIcon from '@material-ui/icons/LastPage';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import CheckCircleOutlineIcon from '@material-ui/icons/CheckCircleOutline';
import PlayCircleOutlineIcon from '@material-ui/icons/PlayCircleOutline';
import AddCircleOutlineIcon from '@material-ui/icons/AddCircleOutline';
import BlockIcon from '@material-ui/icons/Block';
import { rootRouteRef } from '../../routes';
import { useAsync } from 'react-use';

const headerStyles = makeStyles(theme => ({
  header_title_color: {
    color: theme.palette.type === 'light' ? 'rgba(0, 0, 0, 0.87)' : '#ffffff',
  },
  header_subtitle: {
    display: 'inline-block',
    color: theme.palette.type === 'light' ? 'rgba(0, 0, 0, 0.87)' : '#ffffff',
    opacity: 0.8,
    maxWidth: '75ch',
    marginTop: '8px',
    fontWeight: 500,
    lineHeight: 1.57,
  },
}));

export interface MyTaskPageProps {
  initiallySelectedFilter?: 'owned' | 'all';
  contextMenu?: {
    editor?: boolean;
    actions?: boolean;
    create?: boolean;
  };
}

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

export const TaskList = () => {
  const classes = headerStyles();
  const scaffolderApi = useApi(scaffolderApiRef);
  const identityApi = useApi(identityApiRef);

  const { value: isAdmin, loading: adminLoading } = useAsync(async () => {
    const identity = await identityApi.getBackstageIdentity();

    // Check if user is member of admin groups
    const adminGroups = [
      'group:default/admins',
      'group:default/rbac_admin',
      'group:default/portal-admins',
      'group:default/portal_admins',
    ];
    return identity.ownershipEntityRefs.some(ref =>
      adminGroups.includes(ref.toLowerCase()),
    );
  }, []);
  const [tasks, setTasks] = useState<ScaffolderTask[]>([]);
  const [totalTasks, setTotalTasks] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const [filters, setFilters] = useState<Filters>({
    owner: 'owned',
  });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const rootLink = useRouteRef(rootRouteRef);

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

  useEffect(() => {
    if (!adminLoading) {
      setFilters(prevFilters => ({
        ...prevFilters,
        owner: isAdmin ? 'all' : 'owned',
      }));
      setPage(0);
    }
  }, [adminLoading, isAdmin]);

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
  const navigateToTaskDetails = (id: string) => {
    navigate(`${rootLink()}/create/tasks/${id}`);
  };
  const navigateToItemDetails = (
    name?: string,
    namespace: string = 'default',
  ) => {
    if (!name) {
      return;
    }
    navigate(`${rootLink()}/catalog/${namespace}/${name}`);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'failed':
        return <ErrorOutlineIcon style={{ color: 'red' }} />;
      case 'completed':
        return <CheckCircleOutlineIcon style={{ color: 'green' }} />;
      case 'processing':
        return <PlayCircleOutlineIcon style={{ color: 'blue' }} />;
      case 'open':
        return <AddCircleOutlineIcon style={{ color: 'blue' }} />;
      case 'cancelled':
        return <BlockIcon style={{ color: 'yellow' }} />;
      default:
        return <></>;
    }
  };

  return (
    <Page themeId="tool">
      <Header
        pageTitleOverride="Tasks"
        title={
          <span data-testid="taskHeader" className={classes.header_title_color}>
            Task List
          </span>
        }
        subtitle={
          <span className={classes.header_subtitle}>
            View all your past tasks launched from self-service automation
            portal.
          </span>
        }
        style={{ background: 'inherit' }}
      />
      <Content>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={12}>
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
                        <TableCell>Task ID</TableCell>
                        <TableCell>Template</TableCell>
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
                              onClick={() => navigateToTaskDetails(task.id)}
                              style={{ textDecoration: 'none' }}
                            >
                              {task.id}
                            </Link>
                          </TableCell>
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
                            style={{
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
                          <TableCell colSpan={5} align="center">
                            No tasks found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  <TablePagination
                    component="div"
                    count={totalTasks}
                    page={page}
                    onPageChange={handlePageChange}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={handleRowsPerPageChange}
                    ActionsComponent={TablePaginationActions}
                    data-testid="tableToolBar"
                  />
                </TableContainer>
              </Box>
            )}
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
