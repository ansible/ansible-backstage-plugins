import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';

interface BreadcrumbsNavigationProps {
  templateName: string;
  onNavigateToCatalog: () => void;
}

export const BreadcrumbsNavigation: React.FC<BreadcrumbsNavigationProps> = ({
  templateName,
  onNavigateToCatalog,
}) => {
  return (
    <Breadcrumbs sx={{ mb: 2 }}>
      <Link color="inherit" href="#">
        Execution environment definition files
      </Link>
      <Link color="inherit" href="#" onClick={onNavigateToCatalog}>
        Catalog
      </Link>
      <Typography color="text.primary">{templateName}</Typography>
    </Breadcrumbs>
  );
};
