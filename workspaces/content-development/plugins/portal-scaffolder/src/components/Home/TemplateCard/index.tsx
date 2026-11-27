import { useNavigate } from 'react-router-dom';
import { TemplateEntityV1beta3 } from '@backstage/plugin-scaffolder-common';
import {
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  Link,
  Typography,
} from '@material-ui/core';
import { FavoriteEntity } from '@backstage/plugin-catalog-react';
import { useRouteRef } from '@backstage/core-plugin-api';
import { usePermission } from '@backstage/plugin-permission-react';
import { taskCreatePermission } from '@backstage/plugin-scaffolder-common/alpha';
import {
  CONTROLLER_TEMPLATE_TAG,
  controllerTemplateNavigationState,
  type ControllerTemplateSource,
} from '../../controllerTemplateSource';
import { rootRouteRef } from '../../../routes';

export function WizardCard({
  template,
  controllerSource,
}: Readonly<{
  template: TemplateEntityV1beta3;
  controllerSource?: ControllerTemplateSource;
}>) {
  const navigate = useNavigate();
  const rootLink = useRouteRef(rootRouteRef);
  const namespace = template?.metadata?.namespace ?? 'default';
  const name = template?.metadata?.name ?? '';
  const { allowed: canCreateTask } = usePermission({
    permission: taskCreatePermission,
  });

  const source = template.metadata.tags?.includes(CONTROLLER_TEMPLATE_TAG)
    ? controllerSource
    : undefined;
  const openTemplate = (path: string) => {
    if (source) {
      navigate(path, { state: controllerTemplateNavigationState(source) });
    } else {
      navigate(path);
    }
  };
  const chooseWizardItem = () =>
    openTemplate(`${rootLink()}/create/templates/${namespace}/${name}`);
  const onTemplateClick = () =>
    openTemplate(`${rootLink()}/catalog/${namespace}/${name}`);

  return (
    <Card data-testid={`${namespace}-${name}`}>
      <CardHeader
        title={
          <Link
            data-testid="template--title"
            onClick={onTemplateClick}
            style={{ cursor: 'pointer', textDecoration: 'none' }}
          >
            {template?.metadata?.title}
          </Link>
        }
        subheader={template?.spec?.type?.toString()}
        action={<FavoriteEntity entity={template} style={{ padding: 0 }} />}
        style={{ padding: 16 }}
      />
      <Divider />
      <CardContent>
        <div className="description">
          <Typography
            style={{
              marginBottom: '16px',
            }}
            data-testid="template--description"
          >
            {(template?.metadata?.description?.trim().length &&
              template?.metadata?.description) || (
              <Typography style={{ color: 'rgba(119, 119, 109, 1)' }}>
                No description available
              </Typography>
            )}
          </Typography>
        </div>
        <Divider />
        {(template?.metadata?.tags ?? []).length > 0 && (
          <div className="tags" data-testid="template--tags">
            <div style={{ marginTop: 8 }}>
              {template?.metadata?.tags?.map(tag => (
                <Chip
                  label={tag}
                  key={tag}
                  size="small"
                  data-testid={`template-tags--${tag}`}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
      <CardActions
        disableSpacing
        style={{
          marginLeft: 1,
          marginRight: 1,
          justifyContent: 'flex-end',
        }}
      >
        {canCreateTask ? (
          <Button
            size="small"
            variant="outlined"
            color="primary"
            data-testid="template-card-actions--create"
            onClick={chooseWizardItem}
          >
            Start
          </Button>
        ) : null}
      </CardActions>
    </Card>
  );
}
