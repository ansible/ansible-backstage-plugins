import { Box, Card, CardContent, Typography, Link } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import type { ParsedEEDefinition } from '../../../utils/eeDefinitionUtils';

const useStyles = makeStyles(theme => ({
  label: {
    color: theme.palette.text.secondary,
    fontWeight: 600,
    marginBottom: 4,
  },
  value: {
    marginBottom: 12,
  },
  link: {
    cursor: 'pointer',
  },
  fileRef: {
    fontStyle: 'italic',
    color: theme.palette.text.secondary,
  },
}));

interface DefinedContentCardProps {
  parsedDefinition: ParsedEEDefinition | null;
}

/**
 * Card showing explicitly added collections, Python requirements (pip), and system packages
 * from the entity descriptor (spec.definition). Shows each section when present, or "From <file>"
 * when a file reference is used, otherwise "None".
 */
export const DefinedContentCard: React.FC<DefinedContentCardProps> = ({
  parsedDefinition,
}) => {
  const classes = useStyles();

  const collections =
    parsedDefinition?.collections && parsedDefinition.collections.length > 0
      ? parsedDefinition.collections
      : null;
  const collectionsFileRef = parsedDefinition?.collectionsFileRef ?? null;
  const pythonPackages =
    parsedDefinition?.pythonPackages &&
    parsedDefinition.pythonPackages.length > 0
      ? parsedDefinition.pythonPackages
      : null;
  const pythonFileRef = parsedDefinition?.pythonFileRef ?? null;
  const systemPackages =
    parsedDefinition?.systemPackages &&
    parsedDefinition.systemPackages.length > 0
      ? parsedDefinition.systemPackages
      : null;
  const systemFileRef = parsedDefinition?.systemFileRef ?? null;

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
            marginBottom: 4,
          }}
        >
          Defined Content
        </Typography>
        <Typography
          variant="body2"
          color="textSecondary"
          style={{ marginLeft: 10, marginBottom: 16 }}
        >
          Shows explicitly added collections, Python requirements, and system
          packages only
        </Typography>

        <Box style={{ marginLeft: 10 }}>
          <Typography variant="caption" className={classes.label}>
            Collections ({collections?.length ?? (collectionsFileRef ? 1 : 0)}):
          </Typography>
          <Box className={classes.value}>
            {(() => {
              if (collections && collections.length > 0) {
                return collections.map(c => (
                  <Typography key={c.name} variant="body2">
                    <Link
                      href={`https://galaxy.ansible.com/${c.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      color="primary"
                      className={classes.link}
                    >
                      {c.name}
                    </Link>
                    {c.version ? ` ${c.version}` : ''}
                  </Typography>
                ));
              }
              if (collectionsFileRef) {
                return (
                  <Typography variant="body2" className={classes.fileRef}>
                    From {collectionsFileRef}
                  </Typography>
                );
              }
              return (
                <Typography variant="body2" color="textSecondary">
                  None
                </Typography>
              );
            })()}
          </Box>

          <Typography variant="caption" className={classes.label}>
            Python requirements
          </Typography>
          <Box className={classes.value}>
            {(() => {
              if (pythonPackages && pythonPackages.length > 0) {
                return (
                  <Typography variant="body2">
                    {pythonPackages.join(', ')}
                  </Typography>
                );
              }
              if (pythonFileRef) {
                return (
                  <Typography variant="body2" className={classes.fileRef}>
                    From {pythonFileRef}
                  </Typography>
                );
              }
              return (
                <Typography variant="body2" color="textSecondary">
                  None
                </Typography>
              );
            })()}
          </Box>

          <Typography variant="caption" className={classes.label}>
            System packages
          </Typography>
          <Box>
            {(() => {
              if (systemPackages && systemPackages.length > 0) {
                return (
                  <Typography variant="body2">
                    {systemPackages.join(', ')}
                  </Typography>
                );
              }
              if (systemFileRef) {
                return (
                  <Typography variant="body2" className={classes.fileRef}>
                    From {systemFileRef}
                  </Typography>
                );
              }
              return (
                <Typography variant="body2" color="textSecondary">
                  None
                </Typography>
              );
            })()}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};
