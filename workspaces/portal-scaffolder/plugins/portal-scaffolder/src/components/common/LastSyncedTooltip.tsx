import { Box, Divider, Typography } from '@material-ui/core';
import { useTheme } from '@material-ui/core/styles';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import { formatRelativeTime } from '@ansible/portal-plugin-sdk';

/** A catalog-owned summary of the successful synchronization timestamps. */
export function LastSyncedTooltip({
  sources,
}: Readonly<{
  sources: Array<{ label: string; time: string | null }>;
}>) {
  const theme = useTheme();
  return (
    <Box width={400} padding="16px 20px">
      <Typography
        color="textPrimary"
        variant="subtitle1"
        style={{ fontWeight: 600 }}
      >
        Last synced
      </Typography>
      <Box marginY={1}>
        <Divider />
      </Box>
      <Box
        component="dl"
        margin={0}
        display="flex"
        flexDirection="column"
        gridGap={6}
      >
        {sources.map(({ label, time }) => (
          <Box key={label} display="flex" alignItems="center" gridGap={8}>
            <CheckCircleIcon
              style={{ color: theme.palette.success.main }}
              fontSize="small"
            />
            <Box component="dt" flex={1} fontSize="0.85rem">
              {label}
            </Box>
            <Box
              component="dd"
              margin={0}
              fontSize="0.78rem"
              color="text.secondary"
            >
              {formatRelativeTime(time).replace(/^Synced /i, '')}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
