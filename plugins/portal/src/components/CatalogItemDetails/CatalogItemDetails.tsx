import React, { useState, useEffect, useCallback } from 'react';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import { useNavigate, useParams } from 'react-router-dom';
import {
  catalogApiRef,
  UnregisterEntityDialog,
} from '@backstage/plugin-catalog-react';
import { Content, Header, Page } from '@backstage/core-components';
import { Entity } from '@backstage/catalog-model';
import {
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Grid,
  Link,
  makeStyles,
  Typography,
  useTheme,
} from '@material-ui/core';
import DeleteIcon from '@material-ui/icons/Delete';
import SendIcon from '@material-ui/icons/Send';
import { rootRouteRef } from '../../routes';

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
  mr_1: {
    marginRight: '8px',
  },
}));

export const CatalogItemsDetails = () => {
  const classes = headerStyles();
  const theme = useTheme();
  const { namespace, name } = useParams<{
    namespace: string;
    name: string;
  }>();
  const catalogApi = useApi(catalogApiRef);
  const rootRoute = useRouteRef(rootRouteRef);
  const [task, setTask] = useState<Entity | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
  const [error, setError] = useState<Error | undefined>();
  const navigate = useNavigate();

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await catalogApi.getEntityByRef(
        `template:${namespace}/${name}`,
      );
      setTask(response);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [namespace, name, catalogApi]); // Dependencies

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const cleanUpAfterRemoval = async () => {
    setConfirmationDialogOpen(false);
    navigate(rootRoute());
  };

  if (loading) {
    return (
      <Page themeId="tool">
        <Header title="Loading..." />
        <Content>
          <p>Loading entity...</p>
          <CircularProgress />
        </Content>
      </Page>
    );
  }

  if (error) {
    return (
      <Page themeId="tool">
        <Header title="Error" />
        <Content>
          <p>{error.message}</p>
        </Content>
      </Page>
    );
  }

  if (!task) {
    return (
      <Page themeId="tool">
        <Header title="No Data" />
        <Content>
          <p>No entity data available.</p>
        </Content>
      </Page>
    );
  }

  return (
    <Page themeId="tool">
      <Header
        pageTitleOverride="Ansible Portal - Create Task"
        title={
          <span className={classes.header_title_color}>
            {task?.metadata.title}
          </span>
        }
        subtitle={
          <span className={classes.header_subtitle}>
            {task?.metadata.description}
          </span>
        }
        style={{ background: 'inherit' }}
      >
        <Button
          variant="contained"
          color="primary"
          onClick={() =>
            navigate(`${rootRoute()}/create/templates/${namespace}/${name}`)
          }
          startIcon={<SendIcon />}
          className={classes.mr_1}
        >
          Launch
        </Button>
        <Button
          variant="contained"
          color="secondary"
          onClick={() => setConfirmationDialogOpen(true)}
          startIcon={<DeleteIcon />}
        >
          Unregister Template
        </Button>
      </Header>
      <UnregisterEntityDialog
        open={confirmationDialogOpen}
        entity={task!}
        onConfirm={cleanUpAfterRemoval}
        onClose={() => setConfirmationDialogOpen(false)}
      />
      <Content>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Card style={{ maxWidth: '620px' }}>
              {!loading && !error && task && (
                <>
                  {task?.metadata?.links &&
                    task?.metadata?.links?.length > 0 && (
                      <Box
                        border={1}
                        padding="22px 24px"
                        borderColor="grey.300"
                        marginBottom={2}
                      >
                        <Box
                          component="hr"
                          sx={{
                            width: 'calc(100% + 48px)',
                            borderTop: '1px solid grey',
                            margin: '16px -24px',
                          }}
                        />
                        <Typography variant="h6" gutterBottom>
                          Links
                        </Typography>
                        {task.metadata.links.map((link, index) => (
                          <Box key={index} sx={{ marginBottom: 1 }}>
                            <Link
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {link.title}
                            </Link>
                          </Box>
                        ))}
                      </Box>
                    )}

                  <Box
                    border={1}
                    padding="22px 24px 48px"
                    borderColor="grey.300"
                    sx={{ maxWidth: '620px' }}
                  >
                    <Typography
                      style={{ fontSize: '24px', lineHeight: '24px' }}
                    >
                      About
                    </Typography>
                    <Box
                      component="hr"
                      sx={{
                        width: 'calc(100% + 48px)',
                        borderTop: '1px solid grey',
                        margin: '16px -24px',
                      }}
                    />
                    <Grid container>
                      <Grid item lg={12} style={{ paddingTop: '30px' }}>
                        <Typography variant="body1" gutterBottom>
                          <Typography
                            style={{
                              fontSize: '14px',
                              color:
                                theme.palette.type === 'light'
                                  ? '#181818'
                                  : 'rgba(255, 255, 255, 0.70)',
                              marginBottom: '14px',
                            }}
                          >
                            Description
                          </Typography>
                          {task.metadata.description || '/'}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} lg={6}>
                        <Typography variant="body1" gutterBottom>
                          <Typography
                            style={{
                              fontSize: '14px',
                              color:
                                theme.palette.type === 'light'
                                  ? '#181818'
                                  : 'rgba(255, 255, 255, 0.70)',
                              marginBottom: '14px',
                            }}
                          >
                            Owner
                          </Typography>{' '}
                          {String(task?.spec?.owner) || '/'}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} lg={6}>
                        <Typography variant="body1" gutterBottom>
                          <Typography
                            style={{
                              fontSize: '14px',
                              color:
                                theme.palette.type === 'light'
                                  ? '#181818'
                                  : 'rgba(255, 255, 255, 0.70)',
                              marginBottom: '14px',
                            }}
                          >
                            Type
                          </Typography>{' '}
                          <span style={{ textTransform: 'capitalize' }}>
                            {String(task?.spec?.type) || '/'}
                          </span>
                        </Typography>
                      </Grid>
                      <Grid item lg={12}>
                        <Typography variant="body1" gutterBottom>
                          <Typography
                            style={{
                              fontSize: '14px',
                              color:
                                theme.palette.type === 'light'
                                  ? '#181818'
                                  : 'rgba(255, 255, 255, 0.70)',
                              marginBottom: '14px',
                            }}
                          >
                            Tags
                          </Typography>
                          {task?.metadata?.tags?.map((tag, index) => (
                            <Chip label={tag} key={index} variant="outlined" />
                          ))}
                        </Typography>
                      </Grid>
                    </Grid>
                  </Box>
                </>
              )}
            </Card>
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
