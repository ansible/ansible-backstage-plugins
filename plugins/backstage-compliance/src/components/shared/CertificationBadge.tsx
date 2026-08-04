import { Chip, ChipProps } from '@material-ui/core';
import type {
  ScanCertification,
  CertificationStatus,
} from '@ansible/backstage-compliance-common/types';
import { STATUS_COLORS } from './colors';

const COLORS: Record<CertificationStatus, string> = {
  certified: STATUS_COLORS.success,
  conformant: STATUS_COLORS.info,
  uncertified: STATUS_COLORS.neutral,
};

const LABELS: Record<CertificationStatus, string> = {
  certified: 'Certified',
  conformant: 'Conformant',
  uncertified: 'Custom',
};

interface CertificationBadgeProps extends Omit<ChipProps, 'label'> {
  certification: ScanCertification | null | undefined;
}

export const CertificationBadge = ({
  certification,
  style,
  ...chipProps
}: CertificationBadgeProps) => {
  const status = certification?.status ?? 'uncertified';
  return (
    <Chip
      label={LABELS[status]}
      size="small"
      style={{
        fontWeight: 600,
        backgroundColor: COLORS[status],
        color: '#fff',
        ...style,
      }}
      {...chipProps}
    />
  );
};
