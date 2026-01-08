import { useCallback, useMemo, useState, useEffect } from 'react';
import {
  Page,
  Header,
  Content,
  MarkdownContent,
} from '@backstage/core-components';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  useTaskEventStream,
  scaffolderApiRef,
} from '@backstage/plugin-scaffolder-react';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { TaskSteps } from '@backstage/plugin-scaffolder-react/alpha';
import { usePermission } from '@backstage/plugin-permission-react';
import {
  taskCancelPermission,
  taskCreatePermission,
  taskReadPermission,
} from '@backstage/plugin-scaffolder-common/alpha';
import {
  Button,
  CircularProgress,
  makeStyles,
  Typography,
  Box,
  IconButton,
} from '@material-ui/core';
import GetAppIcon from '@material-ui/icons/GetApp';
import ArrowBack from '@material-ui/icons/ArrowBack';
import { selectedTemplateRouteRef } from '../../routes';
import { createTarArchive } from '../utils/tarArchiveUtils';

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
  headerTitleContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  backButtonContainer: {
    marginBottom: theme.spacing(1),
    marginLeft: theme.spacing(-1),
    [theme.breakpoints.up('sm')]: {
      marginLeft: theme.spacing(-1.5),
    },
  },
  backButton: {
    color: theme.palette.type === 'light' ? 'rgba(0, 0, 0, 0.87)' : '#ffffff',
    '&:hover': {
      backgroundColor: 'rgba(0, 0, 0, 0.04)',
    },
  },
}));

export const RunTask = () => {
  const classes = headerStyles();
  const { taskId } = useParams<{ taskId: string }>();
  const { task, completed, loading, error, output, steps, stepLogs } =
    useTaskEventStream(taskId!);
  const taskMetadata = task?.spec?.templateInfo?.entity?.metadata;
  const [showLogs, setShowLogs] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [matchingEntity, setMatchingEntity] = useState<any | null>(null);
  const [expandedTextIndex, setExpandedTextIndex] = useState<number | null>(
    null,
  );
  const scaffolderApi = useApi(scaffolderApiRef);
  const catalogApi = useApi(catalogApiRef);
  const navigate = useNavigate();
  const templateRouteRef = useRouteRef(selectedTemplateRouteRef);

  const { allowed: canCancel } = usePermission({
    permission: taskCancelPermission,
    resourceRef: taskId,
  });
  const { allowed: canRead } = usePermission({
    permission: taskReadPermission,
    resourceRef: taskId,
  });
  const { allowed: canCreateTask } = usePermission({
    permission: taskCreatePermission,
  });

  const taskStatus = useMemo(() => {
    if (!task) return 'unknown';
    if (completed) {
      if (error) return 'failed';
      return 'completed';
    }
    if (task.status === 'cancelled') return 'cancelled';
    return 'processing';
  }, [task, completed, error]);

  useEffect(() => {
    if (taskStatus !== 'processing' && isCanceling) {
      setIsCanceling(false);
    }
  }, [taskStatus, isCanceling]);

  const canStartOver = canRead && canCreateTask;
  const showStartOver = canStartOver;
  const isStartOverDisabled =
    taskStatus === 'processing' || taskStatus === 'unknown';

  const showCancel = canCancel;
  const isCancelDisabled = taskStatus !== 'processing';

  // Function to clean up log content by removing timestamps, logging levels, and AAP URL lines
  const cleanLogContent = (logContent: string): string => {
    return (
      logContent
        .split('\n')
        .filter(line => {
          const urlRegex = /https?:\/\/[^/\s]+\/api\//;
          return (
            !line.includes('[backstage-rhaap-common]: Executing') &&
            urlRegex.exec(line) === null
          );
        })
        .join('\n')
        .replaceAll(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\s*/gm, '')
        // eslint-disable-next-line no-control-regex
        .replaceAll(/\u001b\[[0-9;]*m/g, '')
        .split('\n')
        .map(line => {
          return line.replace(/^\s*(info|warn|error|debug):\s*/i, '').trim();
        })
        .join('\n')
        .replaceAll(/^\s+/gm, '')
        .trim()
    );
  };

  const allSteps = useMemo(
    () =>
      task?.spec.steps.map(step => ({
        ...step,
        ...steps?.[step.id],
      })) ?? [],
    [task, steps],
  );

  const activeStep = useMemo(() => {
    for (let i = allSteps.length - 1; i >= 0; i--) {
      if (allSteps[i].status !== 'open') {
        return i;
      }
    }
    return 0;
  }, [allSteps]);

  const handleCancel = useCallback(async () => {
    if (!taskId || !canCancel || isCancelDisabled) return;

    setIsCanceling(true);
    try {
      await scaffolderApi.cancelTask(taskId);
    } catch (err) {
      console.error('Failed to cancel task:', err); // eslint-disable-line no-console
      setIsCanceling(false);
    }
  }, [taskId, canCancel, isCancelDisabled, scaffolderApi]);

  const handleStartOver = useCallback(() => {
    if (
      !task?.spec?.templateInfo?.entity?.metadata ||
      !canStartOver ||
      isStartOverDisabled
    )
      return;

    const namespace =
      task.spec.templateInfo.entity.metadata.namespace || 'default';
    const templateName = task.spec.templateInfo.entity.metadata.name;

    if (namespace && templateName) {
      const taskParameters = task.spec.parameters || {};
      const filteredParameters = Object.fromEntries(
        Object.entries(taskParameters).filter(([key]) => key !== 'token'),
      );

      navigate(templateRouteRef({ namespace, templateName }), {
        state: { initialFormData: filteredParameters },
      });
    }
  }, [task, canStartOver, isStartOverDisabled, navigate, templateRouteRef]);

  const handleBack = useCallback(() => {
    if (!task?.spec?.templateInfo?.entity?.metadata) {
      navigate(-1);
      return;
    }

    const namespace =
      task.spec.templateInfo.entity.metadata.namespace || 'default';
    const templateName = task.spec.templateInfo.entity.metadata.name;

    if (namespace && templateName) {
      navigate(templateRouteRef({ namespace, templateName }));
    } else {
      navigate(-1);
    }
  }, [task, navigate, templateRouteRef]);

  const handleEntityLinkClick = useCallback(
    (entityRef: string) => {
      const parts = entityRef.split(':');
      if (parts.length === 2) {
        const kind = parts[0];
        const rest = parts[1];
        const pathParts = rest.split('/');

        let namespace: string;
        let name: string;

        if (pathParts.length === 2) {
          namespace = pathParts[0];
          name = pathParts[1];
        } else {
          namespace = 'default';
          name = pathParts[0];
        }

        navigate(`/catalog/${namespace}/${kind}/${name}`);
      } else {
        console.warn(`Unexpected entityRef format: ${entityRef}`); // eslint-disable-line no-console
      }
    },
    [navigate],
  );

  const showDownloadButton = useMemo(() => {
    if (!task) {
      return false;
    }

    const publishToSCM = task?.spec?.parameters?.publishToSCM;
    if (publishToSCM === true) {
      return false;
    }

    if (!completed || error || taskStatus !== 'completed') {
      return false;
    }

    const hasEEDefinitionStep = allSteps.some(
      step => step.id === 'create-ee-definition',
    );

    if (!hasEEDefinitionStep) {
      return false;
    }

    return !!matchingEntity;
  }, [task, completed, error, taskStatus, allSteps, matchingEntity]);

  useEffect(() => {
    if (matchingEntity || !completed || !task) {
      return undefined;
    }

    const publishToSCM = task?.spec?.parameters?.publishToSCM;
    if (publishToSCM === true) {
      return undefined;
    }

    const hasEEDefinitionStep = allSteps.some(
      step => step.id === 'create-ee-definition',
    );

    if (!hasEEDefinitionStep) {
      return undefined;
    }

    const fetchEntity = async () => {
      try {
        const eeFileName = task?.spec?.parameters?.eeFileName as
          | string
          | undefined;
        if (!eeFileName) {
          console.warn('EE file name not found in task parameters'); // eslint-disable-line no-console
          return;
        }

        const entityRef = `Component:default/${eeFileName.trim()}`;
        const foundEntity = await catalogApi.getEntityByRef(entityRef);

        if (
          foundEntity?.kind === 'Component' &&
          foundEntity?.spec?.type === 'execution-environment'
        ) {
          setMatchingEntity(foundEntity);
        } else {
          // eslint-disable-next-line no-console
          console.warn(
            `Could not find registered EE component for ${eeFileName}`,
          );
        }
      } catch (err) {
        console.error('Failed to fetch entity from catalog:', err); // eslint-disable-line no-console
      }
    };
    const timeoutId = setTimeout(() => {
      fetchEntity();
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [matchingEntity, completed, task, allSteps, catalogApi]);

  const getMatchingEntity = useCallback(async (): Promise<any | null> => {
    let entity = matchingEntity;

    if (!entity) {
      const eeFileName = task?.spec?.parameters?.eeFileName as
        | string
        | undefined;
      if (!eeFileName) {
        console.error('EE file name not found in task parameters'); // eslint-disable-line no-console
        return null;
      }

      try {
        const entityRef = `Component:default/${eeFileName.trim()}`;
        const foundEntity = await catalogApi.getEntityByRef(entityRef);

        if (
          foundEntity?.kind === 'Component' &&
          foundEntity?.spec?.type === 'execution-environment'
        ) {
          entity = foundEntity;
          setMatchingEntity(entity);
          return entity;
        }
        console.error('Entity not found in catalog or wrong type'); // eslint-disable-line no-console
        return null;
      } catch (err) {
        console.error('Entity not found in catalog', err); // eslint-disable-line no-console
        return null;
      }
    }

    return entity;
  }, [matchingEntity, catalogApi, task]);

  const handleDownloadArchive = useCallback(async () => {
    const entity = await getMatchingEntity();
    if (
      !entity?.spec?.definition ||
      !entity?.spec?.readme ||
      !entity?.spec?.ansible_cfg ||
      !entity?.spec?.template
    ) {
      // eslint-disable-next-line no-console
      console.error(
        'Entity, definition, readme, ansible_cfg or template not available',
      );
      return;
    }

    try {
      const entityName = entity.metadata?.name || 'execution-environment';
      const eeFileName = `${entityName}.yaml`;
      const readmeFileName = `README-${entityName}.md`;
      const ansibleCfgFileName = `ansible.cfg`;
      const templateFileName = `${entityName}-template.yaml`;
      const archiveName = `${entityName}.tar`;

      const archiveFiles: Array<{ name: string; content: string }> = [
        { name: eeFileName, content: entity.spec.definition },
        { name: readmeFileName, content: entity.spec.readme },
        { name: ansibleCfgFileName, content: entity.spec.ansible_cfg },
        { name: templateFileName, content: entity.spec.template },
      ];

      // only include mcp_vars if it exists
      if (entity.spec.mcp_vars) {
        const mcpVarsFileName = `mcp-vars.yaml`;
        archiveFiles.push({
          name: mcpVarsFileName,
          content: entity.spec.mcp_vars,
        });
      }

      const tarData = createTarArchive(archiveFiles);

      const blob = new Blob([tarData as BlobPart], {
        type: 'application/x-tar',
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = archiveName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download archive:', err); // eslint-disable-line no-console
    }
  }, [getMatchingEntity]);

  if (loading) {
    return (
      <Page themeId="tool">
        <Header title="Template in Progress" />
        <Content>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginTop: '20px',
            }}
          >
            <Typography variant="h6">Executing Template...</Typography>
            <CircularProgress style={{ marginTop: '10px' }} />
          </div>
        </Content>
      </Page>
    );
  }

  return (
    <Page themeId="tool">
      <Header
        pageTitleOverride="Run Task"
        title={
          <Box className={classes.headerTitleContainer}>
            <Box className={classes.backButtonContainer}>
              <IconButton
                onClick={handleBack}
                className={classes.backButton}
                aria-label="go back"
                data-testid="back-button"
              >
                <ArrowBack />
              </IconButton>
            </Box>
            <span className={classes.header_title_color}>
              {taskMetadata?.title}
            </span>
          </Box>
        }
        subtitle={
          <span className={classes.header_subtitle}>
            {taskMetadata?.description}
          </span>
        }
        style={{ background: 'inherit', paddingTop: 0 }}
      />
      <Content>
        <TaskSteps
          steps={allSteps}
          activeStep={activeStep}
          isComplete={completed}
          isError={Boolean(error)}
        />
        <Box
          display="flex"
          flexDirection="column"
          marginTop="20px"
          style={{ gap: '16px' }}
        >
          <Box
            display="flex"
            alignItems="flex-start"
            paddingBottom={showLogs ? 2 : 0}
            style={{
              borderBottom: showLogs ? '1px solid #E4E4E4' : 'none',
            }}
          >
            <Box flex={1} />

            <Box
              display="flex"
              flexWrap="wrap"
              justifyContent="flex-start"
              style={{
                gap: '8px',
                flexShrink: 1,
                flex: '1 1 auto',
                minWidth: 0,
                marginLeft: '50px',
                marginRight: '50px',
              }}
            >
              {output?.links
                ?.filter(link => {
                  if ('if' in link && link.if === false) {
                    return false;
                  }
                  if ('entityRef' in link) {
                    return !!link.entityRef && link.entityRef.trim() !== '';
                  }
                  if ('url' in link) {
                    const url = link.url;
                    return !!url && url !== '#' && url.trim() !== '';
                  }
                  return false;
                })
                ?.map((link, index) => {
                  if ('entityRef' in link && link.entityRef) {
                    return (
                      <Button
                        key={link.entityRef || link.title || `link-${index}`}
                        onClick={() => handleEntityLinkClick(link.entityRef!)}
                        variant="contained"
                        style={{
                          flex: '0 0 calc(33.333% - 6px)',
                          maxWidth: 'calc(33.333% - 6px)',
                        }}
                      >
                        {link.title}
                      </Button>
                    );
                  }
                  return (
                    <Button
                      key={link.url || link.title || `link-${index}`}
                      href={link.url ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="contained"
                      style={{
                        flex: '0 0 calc(33.333% - 6px)',
                        maxWidth: 'calc(33.333% - 6px)',
                      }}
                    >
                      {link.title}
                    </Button>
                  );
                })}
              {showDownloadButton && (
                <Button
                  onClick={handleDownloadArchive}
                  variant="contained"
                  color="primary"
                  startIcon={<GetAppIcon />}
                  disabled={!matchingEntity}
                  title={
                    matchingEntity
                      ? 'Download EE files as tar archive'
                      : 'Waiting for entity...'
                  }
                  style={{
                    flex: '0 0 calc(33.333% - 6px)',
                    maxWidth: 'calc(33.333% - 6px)',
                  }}
                >
                  Download EE Files
                </Button>
              )}
              {completed &&
                !error &&
                output?.text &&
                output.text.length > 0 && (
                  <>
                    {output.text.map((textItem, index) => (
                      <Button
                        key={textItem.title || `text-${index}`}
                        onClick={() => {
                          const newIndex =
                            expandedTextIndex === index ? null : index;
                          setExpandedTextIndex(newIndex);
                          if (newIndex !== null && showLogs) {
                            setShowLogs(false);
                          }
                        }}
                        variant="contained"
                        color={
                          expandedTextIndex === index ? 'secondary' : 'default'
                        }
                        style={{
                          flex: '0 0 calc(33.333% - 6px)',
                          maxWidth: 'calc(33.333% - 6px)',
                        }}
                      >
                        {textItem.title}
                      </Button>
                    ))}
                  </>
                )}
            </Box>

            <Box
              display="flex"
              style={{ gap: '8px' }}
              flexShrink={0}
              flex="0 0 auto"
              justifyContent="flex-end"
            >
              {showCancel && (
                <Button
                  onClick={handleCancel}
                  disabled={isCancelDisabled || isCanceling}
                  variant="outlined"
                  color="secondary"
                >
                  {isCanceling ? 'Canceling...' : 'Cancel'}
                </Button>
              )}
              <Button
                onClick={() => {
                  const newShowLogs = !showLogs;
                  setShowLogs(newShowLogs);
                  if (newShowLogs && expandedTextIndex !== null) {
                    setExpandedTextIndex(null);
                  }
                }}
                variant="contained"
              >
                {showLogs ? 'Hide Logs' : 'Show Logs'}
              </Button>
              {showStartOver && (
                <Button
                  onClick={handleStartOver}
                  disabled={isStartOverDisabled}
                  variant="contained"
                  color="primary"
                >
                  Start Over
                </Button>
              )}
            </Box>
          </Box>
        </Box>
        {completed &&
          !error &&
          output?.text &&
          expandedTextIndex !== null &&
          output.text[expandedTextIndex] && (
            <Box
              marginTop="20px"
              style={{
                borderRadius: '4px',
                padding: '24px',
                boxShadow:
                  '0px 3px 1px -2px rgba(0,0,0,0.2),0px 2px 2px 0px rgba(0,0,0,0.14),0px 1px 5px 0px rgba(0,0,0,0.12)',
              }}
            >
              <Typography
                variant="h6"
                style={{ fontWeight: 'bold', marginBottom: '12px' }}
              >
                {output.text[expandedTextIndex].title}
              </Typography>
              <MarkdownContent
                content={output.text[expandedTextIndex].content || ''}
              />
            </Box>
          )}
        {showLogs && (
          <div
            style={{
              marginBottom: 30,
              borderRadius: '4px',
              padding: '24px',
              boxShadow:
                '0px 3px 1px -2px rgba(0,0,0,0.2),0px 2px 2px 0px rgba(0,0,0,0.14),0px 1px 5px 0px rgba(0,0,0,0.12)',
            }}
          >
            {Object.entries(stepLogs).map(
              ([step, logs]) =>
                logs.length > 0 && (
                  <div key={step}>
                    <Typography
                      variant="body2"
                      style={{ fontWeight: 'bold', marginTop: '10px' }}
                    >
                      {step}:
                    </Typography>
                    {logs.map((log, index) => (
                      <Typography
                        key={`${step}-log-${index}`}
                        variant="body2"
                        style={{ whiteSpace: 'break-spaces' }}
                      >
                        <MarkdownContent content={cleanLogContent(log)} />
                      </Typography>
                    ))}
                  </div>
                ),
            )}
          </div>
        )}
      </Content>
    </Page>
  );
};
