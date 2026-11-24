import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { OptionSpec } from '../api';

const styles = {
  mono: { fontFamily: 'monospace', fontSize: '0.82rem' },
  nested: {
    paddingLeft: 2,
    borderLeft: 2,
    borderColor: 'divider',
    marginTop: 1,
  },
} as const;

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
  if (!spec || depth > 4) return null;

  const choices = spec.choices ?? [];
  const suboptions = spec.suboptions ?? {};

  return (
    <Box sx={depth > 0 ? styles.nested : undefined} mb={1}>
      <Typography variant="body2">
        <Box component="span" sx={styles.mono}>
          {name}
        </Box>{' '}
        {spec.type && (
          <Typography variant="caption" color="text.secondary" component="span">
            {spec.type}
            {spec.elements ? `[${spec.elements}]` : ''}
          </Typography>
        )}
        {spec.required && (
          <Chip size="small" label="required" style={{ marginLeft: 8 }} />
        )}
      </Typography>

      {choices.length > 0 && (
        <Typography variant="caption" color="text.secondary" component="div">
          choices: {choices.map(String).join(' | ')}
          {spec.default !== undefined && `   default: ${String(spec.default)}`}
        </Typography>
      )}
      {choices.length === 0 && spec.default !== undefined && (
        <Typography variant="caption" color="text.secondary" component="div">
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
