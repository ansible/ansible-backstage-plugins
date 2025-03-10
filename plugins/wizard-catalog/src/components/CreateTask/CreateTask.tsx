import React, { useEffect, useState } from 'react';
import { Header, Page, Content } from '@backstage/core-components';
import { StepForm } from '../catalog/StepForm';
import { useApi } from '@backstage/core-plugin-api';
import {
  scaffolderApiRef,
  TemplateParameterSchema,
} from '@backstage/plugin-scaffolder-react';
import { useParams, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { HeaderWithBreadcrumbs } from '../catalog/HeaderWithBreadcrumbs';

export const CreateTask = () => {
  const { namespace, name } = useParams<{
    namespace: string;
    name: string;
  }>();
  const scaffolderApi = useApi(scaffolderApiRef);

  const [entityTemplate, setEntityTemplate] =
    useState<TemplateParameterSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const finalSubmit = async (formData: Record<string, any>) => {
    if (!namespace || !name) {
      throw new Error('Missing namespace or name in URL parameters');
    }

    try {
      const task = await scaffolderApi.scaffold({
        templateRef: `template:${namespace}/${name}`,
        values: formData,
      });

      // Redirect to the task details page
      navigate(`/wizard/catalog/create-task/task/${task.taskId}`);
    } catch (err) {
      console.error('Error during final submit:', err); // eslint-disable-line no-console
    }
  };

  useEffect(() => {
    const fetchEntity = async () => {
      setLoading(true);
      try {
        if (!name) {
          throw new Error('Missing name in URL parameters');
        }
        const response = await scaffolderApi.getTemplateParameterSchema(name);
        setEntityTemplate(response as TemplateParameterSchema);
      } catch (err) {
        setError('Failed to fetch entity');
      } finally {
        setLoading(false);
      }
    };

    fetchEntity();
  }, [name, scaffolderApi]);

  const breadcrumbs = [
    { label: 'Browse', href: '/catalog' },
    { label: entityTemplate?.title || 'Unnamed' },
  ];

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

  return (
    <Page themeId="tool">
      <HeaderWithBreadcrumbs
        title={entityTemplate.title}
        description={entityTemplate.description ?? ''}
        breadcrumbs={breadcrumbs}
        showStar
        namespace={namespace}
        name={name}
      />
      <Content>
        <StepForm steps={entityTemplate.steps} submitFunction={finalSubmit} />
        <Box
          display="flex"
          justifyContent="flex-end"
          marginTop="16px"
          marginBottom={4}
        >
          <Button href="/wizard/catalog" variant="text" color="primary">
            Cancel
          </Button>
        </Box>
      </Content>
    </Page>
  );
};
