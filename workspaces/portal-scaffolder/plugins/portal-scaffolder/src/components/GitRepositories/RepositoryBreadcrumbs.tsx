import { Breadcrumbs, Typography } from '@material-ui/core';
import NavigateNextIcon from '@material-ui/icons/NavigateNext';

import { useCollectionsStyles } from '../CollectionsCatalog/styles';

export interface RepositoryBreadcrumbsProps {
  repositoryName: string;
  onNavigateToCatalog: () => void;
}

export const RepositoryBreadcrumbs = ({
  repositoryName,
  onNavigateToCatalog,
}: RepositoryBreadcrumbsProps) => {
  const classes = useCollectionsStyles();

  return (
    <Breadcrumbs
      separator={<NavigateNextIcon fontSize="small" />}
      className={classes.breadcrumbs}
    >
      <Typography
        className={classes.breadcrumbLink}
        onClick={onNavigateToCatalog}
      >
        Repositories
      </Typography>
      <Typography className={classes.breadcrumbCurrent}>
        {repositoryName}
      </Typography>
    </Breadcrumbs>
  );
};
