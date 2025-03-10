import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import React from 'react';
import { Entity } from '@backstage/catalog-model';
import CardActions from '@mui/material/CardActions';
import { FavoriteTemplateStar } from './FavoriteTemplateStar';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import Divider from '@mui/material/Divider';
import PersonIcon from '@mui/icons-material/Person';

export function WizardCard({ wizardItem }: { wizardItem: Entity }) {
  const theme = useTheme();
  const navigate = useNavigate();

  const chooseWizardItem = () => {
    const namespace = wizardItem?.metadata?.namespace ?? 'default';
    const name = wizardItem?.metadata?.name ?? '';

    // Navigate to the route dynamically
    navigate(`/wizard/catalog/create-task/${namespace}/${name}`);
  };

  return (
    <Card>
      <CardHeader
        title={wizardItem?.metadata?.title}
        subheader={wizardItem?.spec?.type?.toString()}
        action={
          <FavoriteTemplateStar
            namespace={wizardItem?.metadata?.namespace}
            name={wizardItem?.metadata?.name}
          />
        }
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
            {wizardItem?.metadata?.description}
          </Typography>
        </div>
        {wizardItem?.metadata?.tags?.length && (
          <div className="tags">
            <div style={{ marginTop: 8 }}>
              {wizardItem?.metadata?.tags?.map((tag, index) => (
                <Chip
                  label={tag}
                  key={index}
                  size="small"
                  variant="filled"
                  // style={{ fontSize: 12, borderRadius: 10 }}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
      <CardActions
        disableSpacing
        sx={{ marginLeft: 1, marginRight: 1, justifyContent: 'space-between' }}
      >
        <div className="owner">
          {wizardItem?.spec?.owner && (
            <div>
              <PersonIcon
                fontSize="small"
                style={{ position: 'relative', top: 4 }}
              />
              <Typography
                component="span"
                style={{
                  color:
                    theme.palette.mode === 'light'
                      ? '#181818'
                      : 'rgba(255, 255, 255, 0.70)',
                  fontSize: '14px',
                  fontWeight: '400',
                  lineHeight: '24px',
                  marginBottom: '16px',
                }}
              >
                {wizardItem?.spec?.owner?.toString() ?? ''}
              </Typography>
            </div>
          )}
        </div>
        <Button variant="text" onClick={chooseWizardItem}>
          Start
        </Button>
      </CardActions>
    </Card>
  );
}
