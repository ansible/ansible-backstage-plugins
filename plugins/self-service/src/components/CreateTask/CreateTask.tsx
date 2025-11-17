import { useEffect, useState, useMemo } from 'react';
import {
  Header,
  Page,
  Content,
  MarkdownContent,
} from '@backstage/core-components';
import { StepForm } from './StepForm';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  scaffolderApiRef,
  TemplateParameterSchema,
} from '@backstage/plugin-scaffolder-react';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Grid,
  IconButton,
  makeStyles,
} from '@material-ui/core';
import ArrowBack from '@material-ui/icons/ArrowBack';
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

export const CreateTask = () => {
  const classes = headerStyles();
  const { namespace, templateName } = useParams<{
    namespace: string;
    templateName: string;
  }>();
  const scaffolderApi = useApi(scaffolderApiRef);
  const catalogApi = useApi(catalogApiRef);
  const rootLink = useRouteRef(rootRouteRef);
  const location = useLocation();

  const [entityTemplate, setEntityTemplate] =
    useState<TemplateParameterSchema | null>(null);
  const [templateEntity, setTemplateEntity] = useState<{
    spec?: { type?: string };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const initialFormData = useMemo(() => {
    const state = location.state as {
      initialFormData?: Record<string, any>;
    } | null;
    return state?.initialFormData;
  }, [location.state]);

  const finalSubmit = async (formData: Record<string, any>) => {
    if (!namespace || !templateName) {
      throw new Error('Missing namespace or name in URL parameters');
    }

    try {
      const task = await scaffolderApi.scaffold({
        templateRef: `template:${namespace}/${templateName}`,
        values: formData,
      });

      // Redirect to the task details page
      navigate(`${rootLink()}/create/tasks/${task.taskId}`);
    } catch (err) {
      console.error('Error during final submit:', err); // eslint-disable-line no-console
    }
  };

  useEffect(() => {
    const fetchEntity = async () => {
      setLoading(true);
      try {
        if (!templateName || !namespace) {
          throw new Error('Missing name or namespace in URL parameters');
        }
        const response =
          await scaffolderApi.getTemplateParameterSchema(templateName);
        setEntityTemplate(response as TemplateParameterSchema);

        try {
          const entityRef = `template:${namespace}/${templateName}`;
          const entity = await catalogApi.getEntityByRef(entityRef);
          if (entity) {
            setTemplateEntity(entity);
          }
        } catch {
          // Get back to home page if we can't fetch the entity
          // fail silently
        }
      } catch (err) {
        setError('Failed to fetch entity');
      } finally {
        setLoading(false);
      }
    };

    fetchEntity();
  }, [templateName, namespace, scaffolderApi, catalogApi]);

  if (loading) {
    return (
      <Page themeId="tool">
        <Header title="Loading..." />
        <Content>
          <p>Loading entity...</p>
        </Content>
      </Page>
    );
  }

  if (error) {
    return (
      <Page themeId="tool">
        <Header title="Error" />
        <Content>
          <p>{error}</p>
        </Content>
      </Page>
    );
  }

  if (!entityTemplate) {
    return (
      <Page themeId="tool">
        <Header title="No Data" />
        <Content>
          <p>No entity data available.</p>
        </Content>
      </Page>
    );
  }

  const [description, templateInfo] = entityTemplate.description
    ? entityTemplate.description.split('(Template Info)')
    : [];

  const handleBack = () => {
    const isExecutionEnvironment =
      templateEntity?.spec?.type?.includes('execution-environment') ?? false;

    if (isExecutionEnvironment) {
      navigate(`${rootLink()}/ee/create`);
    } else {
      navigate(`${rootLink()}`);
    }
  };

  return (
    <Page themeId="website">
      <Header
        pageTitleOverride="Create Task"
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
            <span
              className={classes.header_title_color}
              data-testid="template-task--title"
            >
              {entityTemplate.title}
            </span>
          </Box>
        }
        subtitle={
          <span className={classes.header_subtitle}>{description}</span>
        }
        style={{ background: 'inherit', paddingTop: 0 }}
      />
      <Content>
        <Grid container direction="row-reverse">
          {templateInfo && (
            <Grid item xs={12} sm={12} md={5} lg={5}>
              <Card>
                <CardHeader title="About Template" />
                <CardContent>
                  <MarkdownContent content={templateInfo} />
                </CardContent>
              </Card>
            </Grid>
          )}
          <Grid
            item
            xs={12}
            sm={12}
            md={templateInfo ? 7 : 12}
            lg={templateInfo ? 7 : 12}
          >
            <StepForm
              steps={entityTemplate.steps}
              submitFunction={finalSubmit}
              initialFormData={initialFormData}
            />
            <Box
              display="flex"
              justifyContent="flex-end"
              marginTop="16px"
              marginBottom={4}
            >
              <Button
                onClick={() => {
                  const isExecutionEnvironment =
                    templateEntity?.spec?.type?.includes(
                      'execution-environment',
                    ) ?? false;

                  if (isExecutionEnvironment) {
                    navigate(`${rootLink()}/ee/create`);
                  } else {
                    navigate(`${rootLink()}`);
                  }
                }}
                variant="text"
                color="primary"
              >
                Cancel
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
