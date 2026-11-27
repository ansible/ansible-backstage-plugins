import type { ReactElement, CSSProperties } from 'react';
import CheckCircleOutline from '@material-ui/icons/CheckCircleOutline';
import CancelOutlined from '@material-ui/icons/CancelOutlined';
import RemoveOutlined from '@material-ui/icons/RemoveOutlined';
import SyncOutlined from '@material-ui/icons/SyncOutlined';
import ScheduleOutlined from '@material-ui/icons/ScheduleOutlined';
import BlockOutlined from '@material-ui/icons/BlockOutlined';
import HelpOutline from '@material-ui/icons/HelpOutline';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import {
  Cell,
  CellText,
  Flex,
  Link,
  Text,
  type ColumnConfig,
  type TextColorStatus,
} from '@backstage/ui';
import { formatTimeAgo } from '../CollectionsCatalog/utils';
import { CIActivityRow, STATUS_LABELS } from './ciActivityUtils';

/** Wireframe-aligned status colors (Ran CI Activity icons + labels). */
const STATUS_ICON_COLOR: Record<CIActivityRow['status'], string> = {
  success: '#3E8635',
  failure: '#C9190B',
  cancelled: '#6A6E73',
  in_progress: '#2B9AF3',
  queued: '#F0AB00',
  skipped: '#6A6E73',
  unknown: '#6A6E73',
};

const EXTERNAL_LINK_ICON_STYLE: CSSProperties = {
  fontSize: 16,
  flexShrink: 0,
};

export function ciActivityStatusColor(
  status: CIActivityRow['status'],
): TextColorStatus | undefined {
  switch (status) {
    case 'success':
      return 'success';
    case 'failure':
      return 'danger';
    case 'queued':
      return 'warning';
    case 'in_progress':
      return 'info';
    default:
      return undefined;
  }
}

function statusIcon(status: CIActivityRow['status']): ReactElement {
  const style: CSSProperties = {
    fontSize: 20,
    color: STATUS_ICON_COLOR[status],
  };
  switch (status) {
    case 'success':
      return <CheckCircleOutline style={style} aria-hidden />;
    case 'failure':
      return <CancelOutlined style={style} aria-hidden />;
    case 'cancelled':
      // Wireframe / prototype: minus-style mark for cancelled runs.
      return <RemoveOutlined style={style} aria-hidden />;
    case 'in_progress':
      return <SyncOutlined style={style} aria-hidden />;
    case 'queued':
      return <ScheduleOutlined style={style} aria-hidden />;
    case 'skipped':
      return <BlockOutlined style={style} aria-hidden />;
    default:
      return <HelpOutline style={style} aria-hidden />;
  }
}

function renderCIActivityStatus(
  row: Pick<CIActivityRow, 'status'>,
): ReactElement {
  const label = STATUS_LABELS[row.status];
  const color = ciActivityStatusColor(row.status);
  return (
    <Cell>
      <Flex align="center" gap="2">
        {statusIcon(row.status)}
        <Text color={color}>{label}</Text>
      </Flex>
    </Cell>
  );
}

/**
 * Project / Event cells: primary link + external-open icon (prototype
 * `CiActivityExternalLink` / wireframe 01 affordance). `standalone` keeps
 * underline on hover so the cell reads as a link without looking underlined
 * at rest.
 */
function renderCIActivityExternalLink(
  label: string,
  href: string,
): ReactElement {
  return (
    <Cell>
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        color="primary"
        standalone
        title={label}
      >
        <Flex align="center" gap="1" style={{ minWidth: 0 }}>
          <Text variant="body-medium" truncate title={label}>
            {label}
          </Text>
          <OpenInNewIcon style={EXTERNAL_LINK_ICON_STYLE} aria-hidden />
        </Flex>
      </Link>
    </Cell>
  );
}

export function buildCIActivityColumnConfig(): ColumnConfig<CIActivityRow>[] {
  return [
    {
      id: 'status',
      label: 'Status',
      cell: row => renderCIActivityStatus(row),
    },
    {
      id: 'project',
      label: 'Project',
      isRowHeader: true,
      cell: row =>
        row.projectUrl ? (
          renderCIActivityExternalLink(row.project, row.projectUrl)
        ) : (
          <CellText title={row.project} />
        ),
    },
    {
      id: 'eventDisplay',
      label: 'Event',
      cell: row =>
        row.runUrl ? (
          renderCIActivityExternalLink(row.eventDisplay, row.runUrl)
        ) : (
          <CellText title={row.eventDisplay} />
        ),
    },
    {
      id: 'trigger',
      label: 'Trigger',
      cell: row => <CellText title={row.trigger} />,
    },
    {
      id: 'time',
      label: 'Time',
      cell: row => (
        <CellText title={row.time ? formatTimeAgo(row.time) : '—'} />
      ),
    },
  ];
}
