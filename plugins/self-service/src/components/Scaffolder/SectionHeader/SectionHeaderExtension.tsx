import { FieldExtensionComponentProps } from '@backstage/plugin-scaffolder-react';
import { Typography, Box, Divider } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles(theme => ({
  root: {
    marginTop: theme.spacing(3),
    marginBottom: theme.spacing(1),
  },
  title: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: theme.palette.text.primary,
  },
  description: {
    fontSize: '0.875rem',
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.5),
  },
}));

export const SectionHeaderExtension = ({
  schema,
}: FieldExtensionComponentProps<undefined>) => {
  const classes = useStyles();

  return (
    <Box className={classes.root}>
      <Divider />
      <Box mt={1.5}>
        <Typography className={classes.title}>{schema?.title}</Typography>
        {schema?.description && (
          <Typography className={classes.description}>
            {schema.description}
          </Typography>
        )}
      </Box>
    </Box>
  );
};
