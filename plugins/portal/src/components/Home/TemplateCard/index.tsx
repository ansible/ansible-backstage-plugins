import React from 'react';
import { useNavigate } from 'react-router-dom';
import PersonIcon from '@material-ui/icons/Person';
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
  useTheme,
} from '@material-ui/core';
import { FavoriteEntity } from '@backstage/plugin-catalog-react';
import { useRouteRef } from '@backstage/core-plugin-api';
import { rootRouteRef } from '../../../routes';

export function WizardCard({ template }: { template: TemplateEntityV1beta3 }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const rootLink = useRouteRef(rootRouteRef);
  const namespace = template?.metadata?.namespace ?? 'default';
  const name = template?.metadata?.name ?? '';

  const chooseWizardItem = () =>
    navigate(`${rootLink()}/create/templates/${namespace}/${name}`);

  const onTemplateClick = () =>
    navigate(`${rootLink()}/catalog/${namespace}/${name}`);

  return (
    <Card>
      <CardHeader
        title={
          <Link
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
          >
            {template?.metadata?.description}
          </Typography>
        </div>
        {template?.metadata?.tags?.length && (
          <div className="tags">
            <div style={{ marginTop: 8 }}>
              {template?.metadata?.tags?.map((tag, index) => (
                <Chip label={tag} key={index} size="small" />
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
          justifyContent: 'space-between',
        }}
      >
        <div className="owner">
          {template?.spec?.owner && (
            <div>
              <PersonIcon
                fontSize="small"
                style={{ position: 'relative', top: 4 }}
              />
              <Typography
                component="span"
                style={{
                  color:
                    theme.palette.type === 'light'
                      ? '#181818'
                      : 'rgba(255, 255, 255, 0.70)',
                  fontSize: '14px',
                  fontWeight: '400',
                  lineHeight: '24px',
                  marginBottom: '16px',
                }}
              >
                {template.spec.owner}
              </Typography>
            </div>
          )}
        </div>
        <Button
          size="small"
          variant="outlined"
          color="primary"
          data-testid="template-card-actions--create"
          onClick={chooseWizardItem}
        >
          Start
        </Button>
      </CardActions>
    </Card>
  );
}
