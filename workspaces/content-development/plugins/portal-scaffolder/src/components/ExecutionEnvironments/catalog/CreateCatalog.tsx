import {
  Box,
  Grid,
  Typography,
  Link as MuiLink,
  Button,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import eeIllustration from '../../../../images/ee-illustration.png';

const useStyles = makeStyles(theme => ({
  containerPadding: {
    paddingTop: '90px',
    paddingLeft: '30px',
  },
  leftColumn: {
    maxWidth: 680,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
    minHeight: '60vh',
    paddingLeft: theme.spacing(4),
  },
  title: {
    color: theme.palette.text.primary,
    marginBottom: theme.spacing(2),
    fontWeight: 300,
    fontSize: '40px',
    lineHeight: '40px',
    letterSpacing: '0px',
  },
  description: {
    color: theme.palette.text.secondary,
    fontSize: 16,
    lineHeight: 1.6,
    marginBottom: theme.spacing(3),
    marginTop: theme.spacing(3),
    width: '100%',
  },
  buttonContainer: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    '& > *:not(:first-child)': {
      marginLeft: theme.spacing(2),
    },
  },
  createButton: {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    paddingLeft: theme.spacing(4),
    paddingRight: theme.spacing(4),
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(2),
    borderRadius: '999px',
    textTransform: 'none',
    fontSize: 16,
    boxShadow: '0 6px 18px rgba(11,95,255,0.18)',
    '&:hover': {
      backgroundColor: theme.palette.primary.dark,
      color: theme.palette.primary.contrastText,
    },
    height: 40,
    minHeight: 40,
  },
  link: {
    color: theme.palette.primary.main,
    fontSize: 14,
    marginTop: 24,
    marginBottom: 24,
    display: 'inline-block',
  },
  rightColumn: {
    textAlign: 'center',
  },
  illustration: {
    width: '320px',
    maxWidth: '100%',
    display: 'inline-block',
    [theme.breakpoints.up('md')]: {
      width: '520px',
    },
  },
}));

export const CreateCatalog = ({
  onTabSwitch,
}: {
  onTabSwitch: (index: number) => void;
}) => {
  const classes = useStyles();

  return (
    <div data-testid="catalog-content">
      <Grid
        container
        spacing={4}
        alignItems="center"
        className={classes.containerPadding}
      >
        {/* Left column */}
        <Grid item xs={12} md={6}>
          <Box className={classes.leftColumn}>
            <Typography variant="h3" component="h1" className={classes.title}>
              No Execution Environment definition files, yet
            </Typography>

            <Typography variant="body1" className={classes.description}>
              Get started with Execution Environment (EE) to ensure your
              playbooks run the same way, every time. Choose a recommended
              preset of a EE definition or start from scratch for full control.
              <br />
              Once your definition is saved, we'll walk you through building the
              EE.
            </Typography>

            <Box className={classes.buttonContainer}>
              <Button
                variant="contained"
                size="large"
                onClick={() => onTabSwitch(1)}
                className={classes.createButton}
              >
                Create Execution Environment definition file
              </Button>

              <MuiLink
                href="https://red.ht/self-service_build_and_use_ee_definition"
                underline="hover"
                className={classes.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                How to build and use Execution Environment from definition files
              </MuiLink>
            </Box>
          </Box>
        </Grid>

        {/* Right column (illustration) */}
        <Grid item xs={12} md={6} className={classes.rightColumn}>
          <img
            src={eeIllustration}
            alt="Execution environment illustration"
            className={classes.illustration}
          />
        </Grid>
      </Grid>
    </div>
  );
};
