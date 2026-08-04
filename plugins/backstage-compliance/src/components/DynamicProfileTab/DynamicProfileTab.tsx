import { useState, useEffect } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { Progress } from '@backstage/core-components';
import { Typography, Box } from '@material-ui/core';
import { complianceApiRef } from '../../api';
import type {
  ComplianceProfile,
  MultiHostFinding,
  ProfileTabDataResponse,
  TabConfig,
} from '@ansible/backstage-compliance-common/types';
import { useDisplayConfig } from '../ResultsViewer/hooks/useDisplayConfig';
import {
  SummaryCardWidget,
  SeverityBreakdownWidget,
  FindingsTableWidget,
  TrendChartWidget,
  HostBreakdownWidget,
  GaugeWidget,
} from './widgets';
import { ScoreGridWidget } from './ScoreGridWidget';
import { ActionTableWidget } from './ActionTableWidget';
import { HostRiskHeatmapWidget } from './HostRiskHeatmapWidget';

interface DynamicProfileTabProps {
  profile: ComplianceProfile;
  tabConfig: TabConfig;
}

type TabData = ProfileTabDataResponse;

export const DynamicProfileTab = ({
  profile,
  tabConfig,
}: DynamicProfileTabProps) => {
  const api = useApi(complianceApiRef);
  const displayConfig = useDisplayConfig(profile.displayConfig);
  const [findings, setFindings] = useState<MultiHostFinding[]>([]);
  const [tabData, setTabData] = useState<TabData | null>(null);
  const [scanMeta, setScanMeta] = useState<
    { totalPackages?: number; totalVulnerabilities?: number } | undefined
  >();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasNewWidgets = (tabConfig.layout ?? []).some(
    w =>
      w.widget === 'score_grid' ||
      w.widget === 'action_table' ||
      w.widget === 'host_risk_heatmap',
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const loadData = async () => {
      try {
        if (hasNewWidgets) {
          const data = await api.getProfileTabData(profile.id);
          if (cancelled) return;
          setTabData(data);
          setScanMeta({
            totalPackages: data.summary.totalPackages,
            totalVulnerabilities: data.summary.totalVulnerabilities,
          });
        }

        const hasLegacyWidgets = (tabConfig.layout ?? []).some(
          w =>
            !['score_grid', 'action_table', 'host_risk_heatmap'].includes(
              w.widget,
            ),
        );
        if (hasLegacyWidgets) {
          const scans = await api.getScans();
          if (cancelled) return;
          const profileScans = scans
            .filter(
              s =>
                s.profileId === profile.id &&
                s.status === 'completed' &&
                s.scanner !== 'remediation',
            )
            .sort(
              (a, b) =>
                new Date(b.completedAt ?? b.startedAt).getTime() -
                new Date(a.completedAt ?? a.startedAt).getTime(),
            );

          if (profileScans.length > 0) {
            const latestScan = profileScans[0];
            const jobId = String(latestScan.workflowJobId ?? latestScan.id);
            const [f, stats] = await Promise.all([
              api.getFindings(jobId),
              api.getBatchScanStats([latestScan.id]),
            ]);
            if (cancelled) return;
            setFindings(f);
            const s = stats[latestScan.id];
            if (s?.totalPackages !== undefined) {
              setScanMeta(
                prev =>
                  prev ?? {
                    totalPackages: s.totalPackages,
                    totalVulnerabilities: s.totalVulnerabilities,
                  },
              );
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load tab data',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [api, profile.id, hasNewWidgets, tabConfig.layout]);

  if (loading) return <Progress />;

  if (error) {
    return (
      <Box p={4} textAlign="center">
        <Typography variant="h6" color="error">
          Failed to load data
        </Typography>
        <Typography variant="body2" color="textSecondary">
          {error}
        </Typography>
      </Box>
    );
  }

  const noData =
    findings.length === 0 && (!tabData || tabData.findings.length === 0);
  if (noData) {
    return (
      <Box p={4} textAlign="center">
        <Typography variant="h6" color="textSecondary">
          No scan data available for {profile.displayName}
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Run a scan to populate this tab.
        </Typography>
      </Box>
    );
  }

  const layout = tabConfig.layout ?? [];

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        {tabConfig.label}
      </Typography>
      {layout.map((widgetConfig, index) => {
        const key = `${widgetConfig.widget}-${index}`;
        const legacyProps = {
          config: widgetConfig,
          findings,
          severityLabel: displayConfig.severityLabel,
          scanMeta,
        };

        switch (widgetConfig.widget) {
          case 'summary_card':
            return <SummaryCardWidget key={key} {...legacyProps} />;
          case 'severity_breakdown':
            return <SeverityBreakdownWidget key={key} {...legacyProps} />;
          case 'findings_table':
            return <FindingsTableWidget key={key} {...legacyProps} />;
          case 'trend_chart':
            return <TrendChartWidget key={key} {...legacyProps} />;
          case 'host_breakdown':
            return <HostBreakdownWidget key={key} {...legacyProps} />;
          case 'gauge':
            return <GaugeWidget key={key} {...legacyProps} />;
          case 'score_grid':
            return (
              <ScoreGridWidget
                key={key}
                config={widgetConfig}
                tabData={tabData}
              />
            );
          case 'action_table':
            return (
              <ActionTableWidget
                key={key}
                config={widgetConfig}
                tabData={tabData}
                profile={profile}
                severityLabel={displayConfig.severityLabel}
              />
            );
          case 'host_risk_heatmap':
            return (
              <HostRiskHeatmapWidget
                key={key}
                config={widgetConfig}
                tabData={tabData}
              />
            );
          default:
            return null;
        }
      })}
    </Box>
  );
};
