import { Box } from '@material-ui/core';
import { Entity } from '@backstage/catalog-model';
import clsx from 'clsx';

import { useCollectionsStyles } from './styles';

export interface RepositoryBadgeProps {
  entity: Entity;
}

export const RepositoryBadge = ({ entity }: RepositoryBadgeProps) => {
  const classes = useCollectionsStyles();

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
  let badgeClass: string;

  if (repoLower === 'rh-certified' || repoLower.includes('certified')) {
    label = 'Certified';
    badgeClass = classes.badgeCertified;
  } else if (repoLower === 'validated' || repoLower.includes('validated')) {
    label = 'Validated';
    badgeClass = classes.badgeValidated;
  } else if (repoLower === 'community' || repoLower.includes('community')) {
    label = 'Community';
    badgeClass = classes.badgeCommunity;
  } else {
    return null;
  }

  return (
    <Box component="span" className={clsx(classes.repositoryBadge, badgeClass)}>
      {label}
    </Box>
  );
};
