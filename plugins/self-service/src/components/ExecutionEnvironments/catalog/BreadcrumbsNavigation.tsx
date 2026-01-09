import { Breadcrumbs, Link, Typography } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles(theme => ({
  breadcrumb: {
    marginBottom: theme.spacing(2),
  },
}));

interface BreadcrumbsNavigationProps {
  templateName: string;
  onNavigateToCatalog: () => void;
}

export const BreadcrumbsNavigation: React.FC<BreadcrumbsNavigationProps> = ({
  templateName,
  onNavigateToCatalog,
}) => {
  const classes = useStyles();

  return (
    <Breadcrumbs className={classes.breadcrumb}>
      <Link color="inherit" href="#">
        Execution environment definition files
      </Link>
      <Link color="inherit" href="#" onClick={onNavigateToCatalog}>
        Catalog
      </Link>
      <Typography color="textPrimary">{templateName}</Typography>
    </Breadcrumbs>
  );
};
