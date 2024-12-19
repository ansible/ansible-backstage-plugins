import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import React from 'react';
import { Entity } from '@backstage/catalog-model';
import Box from '@mui/material/Box';
import CardActions from '@mui/material/CardActions';
import { FavoriteTemplateStar } from './FavoriteTemplateStar';
import { useNavigate } from 'react-router-dom';

export function WizardCard({ wizardItem }: { wizardItem: Entity }) {
  const navigate = useNavigate();

  const chooseWizardItem = () => {
    const namespace = wizardItem?.metadata?.namespace ?? 'default';
    const name = wizardItem?.metadata?.name ?? '';

    // Navigate to the route dynamically
    navigate(`/wizard/catalog/create-task/${namespace}/${name}`);
  };

  return (
    <Card style={{ width: '100%' }}>
      <CardContent>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography
            style={{
              textTransform: 'capitalize',
              color: 'rgba(0, 0, 0, 0.40)',
            }}
          >
            {String(wizardItem?.spec?.type)}
          </Typography>
          <FavoriteTemplateStar
            namespace={wizardItem?.metadata?.namespace}
            name={wizardItem?.metadata?.name}
          />
        </div>
        <CardHeader
          title={wizardItem?.metadata?.title}
          style={{ paddingLeft: '0', paddingRight: '0' }}
        />
        <div className="description">
          <Typography
            style={{
              color: 'rgba(0, 0, 0, 0.40)',
              fontWeight: '700',
              fontSize: '10px',
              lineHeight: '14px',
            }}
          >
            DESCRIPTION
          </Typography>
          <Typography
            style={{
              color: '#181818',
              fontSize: '14px',
              fontWeight: '400',
              lineHeight: '24px',
              marginBottom: '16px',
            }}
          >
            {wizardItem?.metadata?.description}
          </Typography>
        </div>
        {wizardItem?.spec?.owner && (
          <div className="owner">
            <Typography
              style={{
                color: 'rgba(0, 0, 0, 0.40)',
                fontWeight: '700',
                fontSize: '10px',
                lineHeight: '14px',
              }}
            >
              OWNER
            </Typography>
            <Typography
              style={{
                color: '#181818',
                fontSize: '14px',
                fontWeight: '400',
                lineHeight: '24px',
                marginBottom: '16px',
              }}
            >
              {String(wizardItem?.spec?.owner)}
            </Typography>
          </div>
        )}
        {wizardItem?.metadata?.tags?.length && (
          <div className="tags">
            <Typography
              style={{
                color: 'rgba(0, 0, 0, 0.40)',
                fontWeight: '700',
                fontSize: '10px',
                lineHeight: '14px',
              }}
            >
              TAGS
            </Typography>
            <div>
              {wizardItem?.metadata?.tags?.map((tag, index) => (
                <Chip
                  label={tag}
                  key={index}
                  variant="outlined"
                  style={{ borderRadius: '4px' }}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
      <CardActions>
        <Box display="flex" justifyContent="flex-end">
          <Button variant="text" onClick={chooseWizardItem}>
            Choose
          </Button>
        </Box>
      </CardActions>
    </Card>
  );
}
