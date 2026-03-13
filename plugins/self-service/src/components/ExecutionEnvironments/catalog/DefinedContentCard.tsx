import { Box, Card, CardContent, Typography, Divider } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import type { ParsedEEDefinition } from '../../../utils/eeDefinitionUtils';

const useStyles = makeStyles(theme => ({
  value: {
    marginBottom: 12,
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
  aboutCardDescription: {
    color: theme.palette.text.secondary,
    fontSize: '0.875rem',
    marginBottom: theme.spacing(2),
  },
  aboutCardDivider: {
    margin: theme.spacing(2, -2.5),
  },
  aboutCardLabel: {
    color: theme.palette.text.secondary,
    fontWeight: 600,
    fontSize: '0.75rem',
    textTransform: 'uppercase' as const,
    marginBottom: theme.spacing(0.5),
  },
  aboutCardSection: {
    marginTop: theme.spacing(2),
  },
  aboutCardValue: {
    fontSize: '0.875rem',
    wordBreak: 'break-word' as const,
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
  const pythonPackages =
    parsedDefinition?.pythonPackages &&
    parsedDefinition.pythonPackages.length > 0
      ? parsedDefinition.pythonPackages
      : null;
  const systemPackages =
    parsedDefinition?.systemPackages &&
    parsedDefinition.systemPackages.length > 0
      ? parsedDefinition.systemPackages
      : null;

  return (
    <Card className={classes.aboutCard} variant="outlined">
      <CardContent className={classes.aboutCardContent}>
        <Box className={classes.aboutCardHeader}>
          <Typography className={classes.aboutCardTitle}>
            Defined Content
          </Typography>
        </Box>

        <Divider className={classes.aboutCardDivider} />

        <Typography className={classes.aboutCardDescription}>
          Shows explicitly added collections, python requirements, and system
          packages only.
        </Typography>

        <Box className={classes.aboutCardSection}>
          <Typography className={classes.aboutCardLabel}>
            Collections ({collections?.length || 0}):
          </Typography>
          <Box className={classes.value}>
            {collections && collections.length > 0 ? (
              collections.map(c => (
                <Typography key={c.name} variant="body2">
                  {c.name}
                  {c.version ? ` v${c.version}` : ''}
                </Typography>
              ))
            ) : (
              <Typography variant="body2" color="textSecondary">
                None
              </Typography>
            )}
          </Box>

          <Box className={classes.aboutCardSection}>
            <Typography className={classes.aboutCardLabel}>
              Python requirements ({pythonPackages?.length || 0}):
            </Typography>
            {pythonPackages && pythonPackages.length > 0 ? (
              pythonPackages.map(p => (
                <Typography key={p} className={classes.aboutCardValue}>
                  {p}
                </Typography>
              ))
            ) : (
              <Typography className={classes.aboutCardValue}>None</Typography>
            )}
          </Box>

          <Box className={classes.aboutCardSection}>
            <Typography className={classes.aboutCardLabel}>
              System Packages ({systemPackages?.length || 0}):
            </Typography>
            {systemPackages && systemPackages.length > 0 ? (
              systemPackages.map(p => (
                <Typography key={p} className={classes.aboutCardValue}>
                  {p}
                </Typography>
              ))
            ) : (
              <Typography className={classes.aboutCardValue}>None</Typography>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};
