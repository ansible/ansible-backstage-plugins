import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useParams } from 'react-router-dom';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import { Content, Page } from '@backstage/core-components';
import Link from '@mui/material/Link';
import Chip from '@mui/material/Chip';
import { HeaderWithBreadcrumbs } from '../catalog/HeaderWithBreadcrumbs';
import { Entity } from '@backstage/catalog-model';

export const MyItemsDetails = () => {
  const { namespace, name } = useParams<{
    namespace: string;
    name: string;
  }>();
  const catalogApi = useApi(catalogApiRef);
  const [task, setTask] = useState<Entity | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

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

  const breadcrumbs = [
    { label: 'My items', href: '/my-items' },
    { label: task?.metadata?.title || 'Unnamed' },
  ];

  return (
    <Page themeId="tool">
      <HeaderWithBreadcrumbs
        title={task?.metadata?.title ?? ''}
        description={task?.metadata?.description ?? ''}
        breadcrumbs={breadcrumbs}
        showStar
        namespace={namespace}
        name={name}
      />
      <Content>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Box padding={2}>
              {loading && (
                <Box
                  display="flex"
                  justifyContent="center"
                  alignItems="center"
                  height="100px"
                >
                  <CircularProgress />
                </Box>
              )}
              {error && (
                <Alert severity="error">
                  Failed to fetch task details: {error.message}
                </Alert>
              )}
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
                              color: '#6A6E73',
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
                              color: '#6A6E73',
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
                              color: '#6A6E73',
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
                              color: '#6A6E73',
                              marginBottom: '14px',
                            }}
                          >
                            Tags
                          </Typography>
                          {task?.metadata?.tags?.map((tag, index) => (
                            <Chip
                              label={tag}
                              key={index}
                              variant="outlined"
                              style={{
                                background: '#F5F5F5',
                                border: '#D2D2D2',
                              }}
                            />
                          ))}
                        </Typography>
                      </Grid>
                    </Grid>
                  </Box>
                </>
              )}
            </Box>
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
