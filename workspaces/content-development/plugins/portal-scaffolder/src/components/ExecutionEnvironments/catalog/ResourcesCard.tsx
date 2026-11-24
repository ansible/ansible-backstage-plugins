import {
  Box,
  Card,
  CardContent,
  Typography,
  Link,
  Divider,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';

const useStyles = makeStyles(theme => ({
  linkRow: {
    display: 'flex',
    alignItems: 'center',
    gridGap: 8,
    marginBottom: 12,
    '&:last-child': {
      marginBottom: 0,
    },
  },
  link: {
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gridGap: 8,
  },
  aboutCard: {
    borderRadius: 12,
    border: `1px solid ${theme.palette.divider}`,
  },
  aboutCardContent: {
    padding: theme.spacing(2.5),
  },
  aboutCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  aboutCardTitle: {
    fontWeight: 600,
    fontSize: '1.25rem',
  },
  aboutCardDivider: {
    margin: theme.spacing(2, -2.5),
  },
}));

interface ResourcesCardProps {}

/**
 * Card with View in source and readme.md links.
 */
export const ResourcesCard: React.FC<ResourcesCardProps> = () => {
  const classes = useStyles();

  return (
    <Card className={classes.aboutCard} variant="outlined">
      <CardContent className={classes.aboutCardContent}>
        <Box className={classes.aboutCardHeader}>
          <Typography className={classes.aboutCardTitle}>Resources</Typography>
        </Box>

        <Divider className={classes.aboutCardDivider} />

        <Box style={{ marginLeft: 10 }}>
          <Box className={classes.linkRow}>
            <OpenInNewIcon fontSize="small" color="primary" />
            <Link
              href="https://red.ht/ee_assembly-intro-to-builder"
              target="_blank"
              rel="noopener noreferrer"
              variant="body2"
              color="primary"
              className={classes.link}
            >
              Introduction to automation execution environments
            </Link>
          </Box>
          <Box className={classes.linkRow}>
            <OpenInNewIcon fontSize="small" color="primary" />
            <Link
              href="https://red.ht/self-service-create-ee-definitions"
              target="_blank"
              rel="noopener noreferrer"
              variant="body2"
              color="primary"
              className={classes.link}
            >
              Create execution environment definitions in self-service
              automation portal
            </Link>
          </Box>
          <Box className={classes.linkRow}>
            <OpenInNewIcon fontSize="small" color="primary" />
            <Link
              href="https://red.ht/ee_assembly-using-builder"
              target="_blank"
              rel="noopener noreferrer"
              variant="body2"
              color="primary"
              className={classes.link}
            >
              Build execution environment images with Ansible Builder
            </Link>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};
