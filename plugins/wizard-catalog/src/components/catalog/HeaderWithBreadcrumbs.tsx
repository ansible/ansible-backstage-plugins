import React from 'react';
import { Header } from '@backstage/core-components';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';
import { FavoriteTemplateStar } from './FavoriteTemplateStar';
import { useNavigate } from 'react-router-dom';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface HeaderWithBreadcrumbsProps {
  title: string;
  description: string;
  breadcrumbs: Breadcrumb[];
  showStar: boolean;
  namespace?: string;
  name?: string;
}

export const HeaderWithBreadcrumbs: React.FC<HeaderWithBreadcrumbsProps> = ({
  title,
  description,
  breadcrumbs,
  showStar,
  namespace,
  name,
}) => {
  const navigate = useNavigate();
  const navigateTo = (href: string) => {
    navigate(`/wizard${href}`);
  };

  return (
    <Header
      title={
        <Box display="flex" flexDirection="column" alignItems="flex-start">
          <Breadcrumbs
            aria-label="breadcrumb"
            style={{ fontSize: '10px', lineHeight: '14px' }}
          >
            {breadcrumbs.map((breadcrumb, index) =>
              breadcrumb.href ? (
                <Link
                  key={index}
                  color="inherit"
                  onClick={() => breadcrumb.href && navigateTo(breadcrumb.href)}
                  style={{
                    fontSize: 'inherit',
                    lineHeight: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {breadcrumb.label}
                </Link>
              ) : (
                <Typography
                  key={index}
                  variant="body2"
                  color="textPrimary"
                  fontStyle="italic"
                  style={{ fontSize: 'inherit', lineHeight: 'inherit' }}
                >
                  {breadcrumb.label}
                </Typography>
              ),
            )}
          </Breadcrumbs>
          <Box display="flex" alignItems="center">
            {title}
            {showStar && (
              <span
                style={{
                  marginLeft: '6px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <FavoriteTemplateStar namespace={namespace} name={name} />
              </span>
            )}
          </Box>
        </Box>
      }
      subtitle={
        <Typography variant="body2" color="textSecondary">
          {description}
        </Typography>
      }
      style={{ paddingTop: '7px', paddingBottom: '7px' }}
    />
  );
};
