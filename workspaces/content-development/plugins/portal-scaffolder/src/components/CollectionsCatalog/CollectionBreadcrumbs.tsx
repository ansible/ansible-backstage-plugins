import { Breadcrumbs, Typography } from '@material-ui/core';
import NavigateNextIcon from '@material-ui/icons/NavigateNext';

import { CollectionBreadcrumbsProps } from './types';
import { useCollectionsStyles } from './styles';

export const CollectionBreadcrumbs = ({
  collectionName,
  onNavigateToCatalog,
}: CollectionBreadcrumbsProps) => {
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
        Collections
      </Typography>
      <Typography className={classes.breadcrumbCurrent}>
        {collectionName}
      </Typography>
    </Breadcrumbs>
  );
};
