import { Box, Card, CardContent, Typography, Link } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import DescriptionIcon from '@material-ui/icons/Description';

const useStyles = makeStyles(() => ({
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
}));

interface ResourcesCardProps {
  onViewInSource: () => void;
  readmeUrl: string | null;
}

/**
 * Card with View in source and readme.md links.
 */
export const ResourcesCard: React.FC<ResourcesCardProps> = ({
  onViewInSource,
  readmeUrl,
}) => {
  const classes = useStyles();

  return (
    <Card
      variant="outlined"
      style={{ borderRadius: 16, borderColor: '#D3D3D3' }}
    >
      <CardContent>
        <Typography
          variant="h6"
          style={{
            fontWeight: 'bold',
            fontSize: '1.5rem',
            marginLeft: 10,
            marginBottom: 16,
          }}
        >
          Resources
        </Typography>

        <Box style={{ marginLeft: 10 }}>
          <Box className={classes.linkRow}>
            <OpenInNewIcon fontSize="small" color="primary" />
            <Link
              component="button"
              variant="body2"
              color="primary"
              onClick={onViewInSource}
              className={classes.link}
            >
              View in source
            </Link>
          </Box>
          <Box className={classes.linkRow}>
            <DescriptionIcon fontSize="small" color="primary" />
            {readmeUrl ? (
              <Link
                href={readmeUrl}
                target="_blank"
                rel="noopener noreferrer"
                variant="body2"
                color="primary"
                className={classes.link}
              >
                readme.md
              </Link>
            ) : (
              <Typography variant="body2" color="textSecondary">
                readme.md
              </Typography>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};
