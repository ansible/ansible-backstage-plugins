import Breadcrumbs from '@mui/material/Breadcrumbs';
import Typography from '@mui/material/Typography';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

import { CollectionBreadcrumbsProps } from './types';

export const CollectionBreadcrumbs = ({
  collectionName,
  onNavigateToCatalog,
}: CollectionBreadcrumbsProps) => {
  return (
    <Breadcrumbs
      separator={<NavigateNextIcon fontSize="small" />}
      sx={{ mb: 2 }}
    >
      <Typography
        color="primary"
        sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
        onClick={onNavigateToCatalog}
      >
        Collections
      </Typography>
      <Typography color="text.primary" fontWeight={500}>
        {collectionName}
      </Typography>
    </Breadcrumbs>
  );
};
