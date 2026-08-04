import { useState, useCallback } from 'react';
import {
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  IconButton,
  CircularProgress,
  makeStyles,
} from '@material-ui/core';
import CloudDownloadIcon from '@material-ui/icons/CloudDownload';
import { useApi, alertApiRef } from '@backstage/core-plugin-api';
import type {
  HostRiskEntry,
  TabWidget,
} from '@ansible/backstage-compliance-common/types';
import { complianceApiRef } from '../../api';
import { TABLE_STYLES } from '../shared/chipStyles';
import { STATUS_COLORS } from '../shared/colors';

const useStyles = makeStyles(theme => ({
  container: {
    marginBottom: theme.spacing(2),
  },
  riskScore: {
    fontWeight: 700,
    fontFamily: 'monospace',
    fontSize: '0.875rem',
  },
  barCell: {
    minWidth: 160,
  },
  barTrack: {
    display: 'flex',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: STATUS_COLORS.success,
  },
  segCritical: { backgroundColor: STATUS_COLORS.error },
  segMedium: { backgroundColor: STATUS_COLORS.warning },
  segLow: { backgroundColor: '#F4C145' },
}));

interface Props {
  config: TabWidget;
  tabData: {
    hostRisk: HostRiskEntry[];
    summary: { totalPackages: number };
  } | null;
}

export const HostRiskHeatmapWidget = ({ config, tabData }: Props) => {
  const classes = useStyles();
  const api = useApi(complianceApiRef);
  const alertApi = useApi(alertApiRef);
  const [downloadingHost, setDownloadingHost] = useState<string | null>(null);

  const downloadAction = config.actions?.find(
    a => a.type === 'download_artifact',
  );

  const handleDownload = useCallback(
    async (host: HostRiskEntry) => {
      if (!downloadAction || !host.latestScanId) return;
      const artifactKey = `${downloadAction.artifact_key_prefix}${host.hostname}`;
      const ext = downloadAction.file_extension ?? '.json';
      const filename = `${artifactKey}${ext}`;
      setDownloadingHost(host.hostname);
      try {
        await api.downloadArtifact(host.latestScanId, artifactKey, filename);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const label = downloadAction.label ?? 'artifact';
        alertApi.post({
          message: `Failed to download ${label} for ${host.hostname}: ${msg}`,
          severity: 'error',
        });
      } finally {
        setDownloadingHost(null);
      }
    },
    [api, alertApi, downloadAction],
  );

  if (!tabData || tabData.hostRisk.length === 0) return null;

  const hosts = tabData.hostRisk;
  const colLabel = config.labels?.findings ?? 'Findings';
  const critLabel = config.labels?.critical ?? 'Critical';
  const medLabel = config.labels?.medium ?? 'Medium';
  const lowLabel = config.labels?.low ?? 'Low';
  const cleanLabel = config.labels?.clean ?? 'Clean';

  return (
    <Box className={classes.container}>
      {config.title && (
        <Typography variant="subtitle2" color="textSecondary" gutterBottom>
          {config.title}
        </Typography>
      )}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell style={TABLE_STYLES.header}>Host</TableCell>
              <TableCell style={TABLE_STYLES.header} align="right">
                Risk Score
              </TableCell>
              <TableCell style={TABLE_STYLES.header} align="right">
                {colLabel}
              </TableCell>
              <TableCell
                style={TABLE_STYLES.header}
                className={classes.barCell}
              >
                Vulnerable / Clean
              </TableCell>
              {downloadAction && (
                <TableCell style={TABLE_STYLES.header} align="center">
                  {downloadAction.label ?? 'SBOM'}
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {hosts.map(h => {
              const denominator =
                h.scannedPackages > 0
                  ? h.scannedPackages
                  : Math.max(h.total, 1);
              const critPct = (h.critical / denominator) * 100;
              const medPct = (h.medium / denominator) * 100;
              const lowPct = (h.low / denominator) * 100;
              const tooltipText = `${critLabel}: ${h.critical} · ${medLabel}: ${
                h.medium
              } · ${lowLabel}: ${h.low} · ${cleanLabel}: ${
                denominator - h.total
              }`;

              return (
                <TableRow key={h.hostname}>
                  <TableCell>{h.hostname}</TableCell>
                  <TableCell align="right">
                    <Typography
                      className={classes.riskScore}
                      style={{
                        color: (() => {
                          if (h.score >= 50) return STATUS_COLORS.error;
                          if (h.score >= 20) return STATUS_COLORS.warning;
                          return STATUS_COLORS.success;
                        })(),
                      }}
                    >
                      {h.score}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{h.total}</TableCell>
                  <TableCell className={classes.barCell}>
                    <Tooltip title={tooltipText} arrow>
                      <div className={classes.barTrack}>
                        {critPct > 0 && (
                          <div
                            className={classes.segCritical}
                            style={{ width: `${critPct}%` }}
                          />
                        )}
                        {medPct > 0 && (
                          <div
                            className={classes.segMedium}
                            style={{ width: `${medPct}%` }}
                          />
                        )}
                        {lowPct > 0 && (
                          <div
                            className={classes.segLow}
                            style={{ width: `${lowPct}%` }}
                          />
                        )}
                      </div>
                    </Tooltip>
                  </TableCell>
                  {downloadAction && (
                    <TableCell align="center">
                      <Tooltip
                        title={
                          h.latestScanId
                            ? `Download SBOM for ${h.hostname}`
                            : 'No SBOM available'
                        }
                        arrow
                      >
                        <span>
                          <IconButton
                            size="small"
                            disabled={
                              !h.latestScanId || downloadingHost === h.hostname
                            }
                            onClick={() => handleDownload(h)}
                          >
                            {downloadingHost === h.hostname ? (
                              <CircularProgress size={16} />
                            ) : (
                              <CloudDownloadIcon fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};
