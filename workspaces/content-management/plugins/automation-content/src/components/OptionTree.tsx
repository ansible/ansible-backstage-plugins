import { Box, Chip, Typography, makeStyles } from '@material-ui/core';
import { OptionSpec } from '../api';

const useStyles = makeStyles(theme => ({
  mono: { fontFamily: 'monospace', fontSize: '0.82rem' },
  nested: {
    paddingLeft: theme.spacing(2),
    borderLeft: `2px solid ${theme.palette.divider}`,
    marginTop: theme.spacing(1),
  },
}));

/**
 * Render an argument specification, recursing into suboptions.
 *
 * The nesting is the point: network resource modules carry most of their meaning
 * several levels deep, and a flattened view omits exactly what someone writing a task —
 * or an agent generating one — needs to get right.
 */
export const OptionTree = ({
  name,
  spec,
  depth = 0,
}: {
  name: string;
  spec: OptionSpec;
  depth?: number;
}) => {
  const classes = useStyles();
  if (!spec || depth > 4) return null;

  const choices = spec.choices ?? [];
  const suboptions = spec.suboptions ?? {};

  return (
    <Box className={depth > 0 ? classes.nested : undefined} mb={1}>
      <Typography variant="body2">
        <span className={classes.mono}>{name}</span>{' '}
        {spec.type && (
          <Typography variant="caption" color="textSecondary" component="span">
            {spec.type}
            {spec.elements ? `[${spec.elements}]` : ''}
          </Typography>
        )}
        {spec.required && (
          <Chip size="small" label="required" style={{ marginLeft: 8 }} />
        )}
      </Typography>

      {choices.length > 0 && (
        <Typography variant="caption" color="textSecondary" component="div">
          choices: {choices.map(String).join(' | ')}
          {spec.default !== undefined && `   default: ${String(spec.default)}`}
        </Typography>
      )}
      {choices.length === 0 && spec.default !== undefined && (
        <Typography variant="caption" color="textSecondary" component="div">
          default: {String(spec.default)}
        </Typography>
      )}
      {(spec.description ?? []).length > 0 && (
        <Typography variant="caption" component="div">
          {(spec.description ?? [])[0]}
        </Typography>
      )}

      {Object.entries(suboptions).map(([sub, subSpec]) => (
        <OptionTree key={sub} name={sub} spec={subSpec} depth={depth + 1} />
      ))}
    </Box>
  );
};
