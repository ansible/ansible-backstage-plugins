import React, { useEffect, useState } from 'react';
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
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Grid,
  makeStyles,
} from '@material-ui/core';
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
}));

export const CreateTask = () => {
  const classes = headerStyles();
  const { namespace, templateName } = useParams<{
    namespace: string;
    templateName: string;
  }>();
  const scaffolderApi = useApi(scaffolderApiRef);
  const rootLink = useRouteRef(rootRouteRef);

  const [entityTemplate, setEntityTemplate] =
    useState<TemplateParameterSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

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
        if (!templateName) {
          throw new Error('Missing name in URL parameters');
        }
        const response =
          await scaffolderApi.getTemplateParameterSchema(templateName);
        setEntityTemplate(response as TemplateParameterSchema);
      } catch (err) {
        setError('Failed to fetch entity');
      } finally {
        setLoading(false);
      }
    };

    fetchEntity();
  }, [templateName, scaffolderApi]);

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

  return (
    <Page themeId="website">
      <Header
        pageTitleOverride="Create Task"
        title={
          <span
            className={classes.header_title_color}
            data-testid="template-task--title"
          >
            {entityTemplate.title}
          </span>
        }
        subtitle={
          <span className={classes.header_subtitle}>{description}</span>
        }
        style={{ background: 'inherit' }}
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
            />
            <Box
              display="flex"
              justifyContent="flex-end"
              marginTop="16px"
              marginBottom={4}
            >
              <Button href="/self-service" variant="text" color="primary">
                Cancel
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
