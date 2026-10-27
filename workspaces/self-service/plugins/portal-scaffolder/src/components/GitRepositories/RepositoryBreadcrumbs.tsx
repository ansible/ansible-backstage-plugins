import Breadcrumbs from '@mui/material/Breadcrumbs';
import Typography from '@mui/material/Typography';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

export interface RepositoryBreadcrumbsProps {
  repositoryName: string;
  onNavigateToCatalog: () => void;
}

export const RepositoryBreadcrumbs = ({
  repositoryName,
  onNavigateToCatalog,
}: RepositoryBreadcrumbsProps) => {
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
        Repositories
      </Typography>
      <Typography color="text.primary" fontWeight={500}>
        {repositoryName}
      </Typography>
    </Breadcrumbs>
  );
};
