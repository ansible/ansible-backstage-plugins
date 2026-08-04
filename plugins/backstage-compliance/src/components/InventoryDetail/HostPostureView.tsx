import { Fragment, useEffect } from 'react';
import type { FC } from 'react';
import { useState, useMemo, useCallback } from 'react';
import { Typography, ButtonGroup, Button, makeStyles } from '@material-ui/core';
import type { HostPosture } from '@ansible/backstage-compliance-common/types';
import { computeClusters, CHIP_THRESHOLD, type Cluster } from './hostUtils';
import { StripPlot } from './StripPlot';
import { ChipMatrix } from './ChipMatrix';
import { HostDetailDrawer } from './HostDetailDrawer';
import type { ResolvedDisplayConfig } from '../ResultsViewer/hooks/useDisplayConfig';

const useStyles = makeStyles(theme => ({
  breadcrumb: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    cursor: 'pointer',
    color: theme.palette.primary.main,
    fontSize: '0.85rem',
    '&:hover': { textDecoration: 'underline' },
  },
  breadcrumbTrail: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginBottom: theme.spacing(1.5),
    flexWrap: 'wrap' as const,
  },
}));

interface ZoomEntry {
  level: 'zoomed-strip' | 'chips';
  hosts: HostPosture[];
  label: string;
}

interface HostPostureViewProps {
  hosts: HostPosture[];
  osFilter: string | null;
  profileLabel: string;
  baseline?: { rate: number; passCount: number; ruleCount: number };
  scanId: string;
  inventoryId: number;
  profileId: string;
  workflowJobId?: number;
  displayConfig?: ResolvedDisplayConfig;
}

type ViewMode = 'auto' | 'chips' | 'distribution';

export const HostPostureView: FC<HostPostureViewProps> = ({
  hosts,
  osFilter,
  profileLabel,
  baseline,
  scanId,
  inventoryId,
  profileId,
  workflowJobId,
  displayConfig,
}) => {
  const classes = useStyles();
  const [zoomStack, setZoomStack] = useState<ZoomEntry[]>([]);
  const [drawerHost, setDrawerHost] = useState<HostPosture | null>(null);
  const [viewOverride, setViewOverride] = useState<ViewMode>('auto');

  const filteredHosts = useMemo(
    () => (osFilter ? hosts.filter(h => h.os === osFilter) : hosts),
    [hosts, osFilter],
  );

  const effectiveView = useMemo(() => {
    if (viewOverride !== 'auto') return viewOverride;
    return filteredHosts.length > CHIP_THRESHOLD ? 'distribution' : 'chips';
  }, [viewOverride, filteredHosts.length]);

  const topClusters = useMemo(
    () => computeClusters(filteredHosts),
    [filteredHosts],
  );
  const currentZoom =
    zoomStack.length > 0 ? zoomStack[zoomStack.length - 1] : null;

  const pushZoom = useCallback((cluster: Cluster) => {
    const label = `${cluster.hosts.length} hosts · ${cluster.min.toFixed(
      0,
    )}–${cluster.max.toFixed(0)}%`;
    if (cluster.hosts.length <= CHIP_THRESHOLD) {
      setZoomStack(prev => [
        ...prev,
        { level: 'chips', hosts: cluster.hosts, label },
      ]);
      return;
    }
    const subClusters = computeClusters(cluster.hosts);
    if (subClusters.length <= 1) {
      setZoomStack(prev => [
        ...prev,
        { level: 'chips', hosts: cluster.hosts, label },
      ]);
    } else {
      setZoomStack(prev => [
        ...prev,
        { level: 'zoomed-strip', hosts: cluster.hosts, label },
      ]);
    }
  }, []); // cluster arg is always fresh from caller — no external deps

  const goHome = useCallback(() => setZoomStack([]), []);

  useEffect(() => {
    setZoomStack([]);
    setViewOverride('auto');
  }, [osFilter]);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <Typography variant="subtitle1" style={{ fontWeight: 600 }}>
          {profileLabel} — Host Compliance
        </Typography>
        {filteredHosts.length > 0 && !currentZoom && (
          <ButtonGroup size="small" variant="outlined">
            {(['auto', 'chips', 'distribution'] as const).map(mode => (
              <Button
                key={mode}
                onClick={() => setViewOverride(mode)}
                style={
                  viewOverride === mode
                    ? { backgroundColor: 'rgba(0,0,0,0.08)', fontWeight: 600 }
                    : undefined
                }
              >
                {(() => {
                  if (mode === 'auto')
                    return `Auto (${
                      filteredHosts.length > CHIP_THRESHOLD
                        ? 'Distribution'
                        : 'Chips'
                    })`;
                  if (mode === 'chips') return 'Chips';
                  return 'Distribution';
                })()}
              </Button>
            ))}
          </ButtonGroup>
        )}
      </div>

      {zoomStack.length > 0 && (
        <div className={classes.breadcrumbTrail}>
          <span
            className={classes.breadcrumb}
            role="button"
            tabIndex={0}
            onClick={goHome}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') goHome();
            }}
          >
            All hosts ({filteredHosts.length})
          </span>
          {zoomStack.map((entry, i) => (
            <Fragment key={i}>
              <Typography
                variant="body2"
                color="textSecondary"
                style={{ margin: '0 2px' }}
              >
                ›
              </Typography>
              {i < zoomStack.length - 1 ? (
                <span
                  className={classes.breadcrumb}
                  role="button"
                  tabIndex={0}
                  onClick={() => setZoomStack(prev => prev.slice(0, i + 1))}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ')
                      setZoomStack(prev => prev.slice(0, i + 1));
                  }}
                >
                  {entry.label}
                </span>
              ) : (
                <Typography variant="body2" style={{ fontWeight: 600 }}>
                  {entry.label}
                </Typography>
              )}
            </Fragment>
          ))}
        </div>
      )}

      {!currentZoom &&
        effectiveView === 'distribution' &&
        filteredHosts.length > 0 && (
          <StripPlot
            hosts={filteredHosts}
            allHosts={filteredHosts}
            clusters={topClusters}
            onClusterClick={pushZoom}
            onDotClick={setDrawerHost}
            height={180}
            displayConfig={displayConfig}
          />
        )}

      {!currentZoom &&
        effectiveView === 'chips' &&
        filteredHosts.length > 0 && (
          <ChipMatrix
            hosts={filteredHosts}
            allHosts={filteredHosts}
            onHostClick={setDrawerHost}
            displayConfig={displayConfig}
          />
        )}

      {currentZoom?.level === 'zoomed-strip' && (
        <StripPlot
          hosts={currentZoom.hosts}
          allHosts={filteredHosts}
          clusters={computeClusters(currentZoom.hosts)}
          onClusterClick={pushZoom}
          onDotClick={setDrawerHost}
          height={160}
          displayConfig={displayConfig}
        />
      )}

      {currentZoom?.level === 'chips' && (
        <ChipMatrix
          hosts={currentZoom.hosts}
          allHosts={filteredHosts}
          onHostClick={setDrawerHost}
          displayConfig={displayConfig}
        />
      )}

      {drawerHost && (
        <HostDetailDrawer
          host={drawerHost}
          allHosts={filteredHosts}
          onClose={() => setDrawerHost(null)}
          profileLabel={profileLabel}
          baseline={baseline}
          scanId={scanId}
          inventoryId={inventoryId}
          profileId={profileId}
          workflowJobId={workflowJobId}
          displayConfig={displayConfig}
        />
      )}
    </div>
  );
};
