import { Typography, Box, Paper, makeStyles } from '@material-ui/core';
import type { TabWidget } from '@ansible/backstage-compliance-common/types';
import { SEVERITY_COLORS } from '../shared/colors';

const useStyles = makeStyles(theme => ({
  grid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  card: {
    flex: '1 1 140px',
    minWidth: 140,
    maxWidth: 200,
    padding: theme.spacing(2),
    textAlign: 'center',
  },
  value: {
    fontSize: '2rem',
    fontWeight: 900,
    lineHeight: 1.2,
  },
  label: {
    fontSize: '0.72rem',
    fontWeight: 600,
    letterSpacing: '0.6px',
    textTransform: 'uppercase' as const,
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.5),
  },
}));

interface TabSummary {
  totalPackages: number;
  totalVulnerabilities: number;
  totalScannedPackages?: number;
  totalVulnerablePackages?: number;
  fixable: number;
  unfixable: number;
  hostsAffected: number;
  criticalHigh: number;
}

interface Props {
  config: TabWidget;
  tabData: { summary: TabSummary } | null;
}

export const ScoreGridWidget = ({ config, tabData }: Props) => {
  const classes = useStyles();
  const s = tabData?.summary;
  if (!s) return null;

  const configLabels = config.labels ?? {};
  const cards = [
    { label: configLabels.total ?? 'Total Packages', value: s.totalScannedPackages || s.totalPackages || '—', color: '#0066CC' },
    { label: configLabels.active ?? 'Active CVEs', value: s.totalVulnerabilities, color: SEVERITY_COLORS.CAT_I },
    { label: configLabels.critical ?? 'Critical / High', value: s.criticalHigh, color: '#A30000' },
    { label: configLabels.fixable ?? 'Fixable', value: s.fixable, color: '#3E8635' },
    { label: configLabels.hosts ?? 'Hosts Affected', value: s.hostsAffected, color: '#6A6E73' },
  ];

  return (
    <Box>
      {config.title && (
        <Typography variant="subtitle2" color="textSecondary" gutterBottom>
          {config.title}
        </Typography>
      )}
      <Box className={classes.grid}>
        {cards.map(card => (
          <Paper key={card.label} className={classes.card} variant="outlined">
            <Typography className={classes.value} style={{ color: card.color }}>
              {card.value}
            </Typography>
            <Typography className={classes.label}>{card.label}</Typography>
          </Paper>
        ))}
      </Box>
    </Box>
  );
};
