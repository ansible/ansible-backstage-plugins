import React from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@material-ui/core';
import DeleteIcon from '@material-ui/icons/Delete';
import SendIcon from '@material-ui/icons/Send';

import { useRouteRef } from '@backstage/core-plugin-api';
import { catalogEntityDeletePermission } from '@backstage/plugin-catalog-common/alpha';
import { useEntityPermission } from '@backstage/plugin-catalog-react/alpha';
import { usePermission } from '@backstage/plugin-permission-react';
import { taskCreatePermission } from '@backstage/plugin-scaffolder-common/alpha';

import { selectedTemplateRouteRef } from '../../routes';

export const TemplateActions = ({
  onUnregisterClick,
}: {
  onUnregisterClick: React.MouseEventHandler<HTMLButtonElement>;
}) => {
  const { namespace, templateName } = useParams<{
    namespace: string;
    templateName: string;
  }>();
  const { allowed: canCreateTask } = usePermission({
    permission: taskCreatePermission,
  });
  const { allowed: canUnregisterTemplate, error } = useEntityPermission(
    catalogEntityDeletePermission,
  );
  const templateRouteRef = useRouteRef(selectedTemplateRouteRef);
  const navigate = useNavigate();

  const onLaunchTemplate = () => {
    if (namespace && templateName)
      navigate(templateRouteRef({ namespace, templateName }));
  };

  return (
    <>
      {canCreateTask ? (
        <Button
          variant="contained"
          color="primary"
          onClick={onLaunchTemplate}
          startIcon={<SendIcon />}
          style={{ marginRight: 8 }}
        >
          Launch
        </Button>
      ) : null}
      {canUnregisterTemplate && !error ? (
        <Button
          variant="contained"
          color="secondary"
          onClick={onUnregisterClick}
          startIcon={<DeleteIcon />}
        >
          Unregister Template
        </Button>
      ) : null}
    </>
  );
};
