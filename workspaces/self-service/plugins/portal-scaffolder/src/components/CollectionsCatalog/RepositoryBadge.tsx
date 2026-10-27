import Box from '@mui/material/Box';
import type { SystemStyleObject, Theme } from '@mui/system';
import { Entity } from '@backstage/catalog-model';

export interface RepositoryBadgeProps {
  entity: Entity;
}

const baseBadgeSx: SystemStyleObject<Theme> = {
  display: 'inline-flex',
  alignItems: 'center',
  px: 1.25,
  py: 0.25,
  borderRadius: 50,
  fontSize: '0.75rem',
  fontWeight: 500,
  ml: 1,
  flexShrink: 0,
};

const badgeVariants: Record<string, SystemStyleObject<Theme>> = {
  certified: {
    backgroundColor: 'rgba(65, 253, 71, 0.15)',
    color: 'text.primary',
  },
  validated: {
    backgroundColor: 'rgba(65, 253, 71, 0.15)',
    color: 'text.primary',
  },
  community: {
    color: 'text.primary',
  },
};

export const RepositoryBadge = ({ entity }: RepositoryBadgeProps) => {
  const annotations = entity.metadata?.annotations || {};
  const collectionSource = annotations['ansible.io/collection-source'];

  if (collectionSource !== 'pah') {
    return null;
  }

  const repositoryName = annotations['ansible.io/collection-source-repository'];

  if (!repositoryName) {
    return null;
  }

  const repoLower = repositoryName.toLowerCase();

  let label: string;
  let variant: string;

  if (repoLower === 'rh-certified' || repoLower.includes('certified')) {
    label = 'Certified';
    variant = 'certified';
  } else if (repoLower === 'validated' || repoLower.includes('validated')) {
    label = 'Validated';
    variant = 'validated';
  } else if (repoLower === 'community' || repoLower.includes('community')) {
    label = 'Community';
    variant = 'community';
  } else {
    return null;
  }

  return (
    <Box
      component="span"
      sx={theme => ({
        ...baseBadgeSx,
        ...badgeVariants[variant],
        border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)'}`,
        ...(variant === 'community' && {
          backgroundColor:
            theme.palette.mode === 'dark'
              ? 'rgba(255, 255, 255, 0.08)'
              : 'rgba(0, 0, 0, 0.06)',
        }),
      })}
    >
      {label}
    </Box>
  );
};
