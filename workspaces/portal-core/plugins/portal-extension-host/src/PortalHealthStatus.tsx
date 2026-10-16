import { useEffect, useState } from 'react';
import {
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  Chip,
} from '@material-ui/core';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';

// ── Types (mirrored from portal-plugin-node to avoid a frontend dependency) ───

type HealthState = 'READY' | 'DEGRADED' | 'UNAVAILABLE' | 'UNKNOWN';

interface HealthStatus {
  state: HealthState;
  message: string;
}

type HealthSnapshot = Record<string, HealthStatus>;

// ── Chip colour mapping ────────────────────────────────────────────────────────

const STATE_STYLES: Record<
  HealthState,
  { label: string; backgroundColor: string; color: string }
> = {
  READY: { label: 'Ready', backgroundColor: '#e8f5e9', color: '#2e7d32' },
  DEGRADED: { label: 'Degraded', backgroundColor: '#fff8e1', color: '#f57f17' },
  UNAVAILABLE: {
    label: 'Unavailable',
    backgroundColor: '#ffebee',
    color: '#c62828',
  },
  UNKNOWN: { label: 'Unknown', backgroundColor: '#eeeeee', color: '#616161' },
};

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Fetches the aggregated health snapshot from `GET /api/portal-health/status`.
 * Polls every `intervalMs` milliseconds (default: 30 s).
 */
export function usePortalHealthStatus(intervalMs = 30_000): {
  snapshot: HealthSnapshot | null;
  loading: boolean;
  error: Error | null;
} {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchSnapshot = async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('portal-health');
        const response = await fetchApi.fetch(`${baseUrl}/status`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data: HealthSnapshot = await response.json();
        if (mounted) {
          setSnapshot(data);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error
              ? err
              : new Error('Failed to fetch health status'),
          );
          setLoading(false);
        }
      }
    };

    fetchSnapshot();
    const timer = setInterval(fetchSnapshot, intervalMs);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [discoveryApi, fetchApi, intervalMs]);

  return { snapshot, loading, error };
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Displays the aggregated health status of all registered portal plugins.
 *
 * Polls `GET /api/portal-health/status` (served by `@ansible/portal-health-backend`)
 * every 30 seconds and renders a table of plugin IDs with coloured status chips.
 *
 * Intended for use in the portal admin/settings area. Drop it anywhere a host
 * page wants to surface operational health:
 *
 * ```tsx
 * import { PortalHealthStatus } from '@ansible/portal-extension-host';
 *
 * export const AdminPage = () => (
 *   <Page>
 *     <Content>
 *       <PortalHealthStatus />
 *     </Content>
 *   </Page>
 * );
 * ```
 *
 * @param pollIntervalMs - How often to re-fetch health statuses (default: 30 000 ms).
 */
export const PortalHealthStatus = ({
  pollIntervalMs = 30_000,
}: {
  pollIntervalMs?: number;
}) => {
  const { snapshot, loading, error } = usePortalHealthStatus(pollIntervalMs);

  if (loading) {
    return (
      <CircularProgress
        size={24}
        style={{ display: 'block', margin: '16px auto' }}
      />
    );
  }

  if (error) {
    return (
      <Typography color="error" variant="body2">
        Failed to load plugin health: {error.message}
      </Typography>
    );
  }

  if (!snapshot || Object.keys(snapshot).length === 0) {
    return (
      <Typography variant="body2" color="textSecondary">
        No portal plugins have reported health status yet.
      </Typography>
    );
  }

  return (
    <Table size="small" aria-label="Portal plugin health status">
      <TableHead>
        <TableRow>
          <TableCell>
            <Typography variant="subtitle2">Plugin</Typography>
          </TableCell>
          <TableCell>
            <Typography variant="subtitle2">Status</Typography>
          </TableCell>
          <TableCell>
            <Typography variant="subtitle2">Message</Typography>
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {Object.entries(snapshot)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([pluginId, status]) => {
            const style = STATE_STYLES[status.state] ?? STATE_STYLES.UNKNOWN;
            return (
              <TableRow key={pluginId}>
                <TableCell>
                  <Typography variant="body2">
                    <code>{pluginId}</code>
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={style.label}
                    size="small"
                    style={{
                      backgroundColor: style.backgroundColor,
                      color: style.color,
                      fontWeight: 600,
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="textSecondary">
                    {status.message}
                  </Typography>
                </TableCell>
              </TableRow>
            );
          })}
      </TableBody>
    </Table>
  );
};
