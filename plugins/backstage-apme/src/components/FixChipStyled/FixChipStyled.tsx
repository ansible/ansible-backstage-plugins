/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Chip, Tooltip, makeStyles } from '@material-ui/core';
import {
  effectiveFixType,
  fixMethodLabel,
  fixMethodTooltip,
  type FixType,
} from '@ansible/backstage-apme-common/severity';

export type FixChipStatus = 'proposed' | 'excluded' | 'in-pr' | 'resolved';

const useStyles = makeStyles(() => ({
  chip: {
    fontWeight: 600,
    fontSize: 11,
    height: 22,
    borderRadius: 3,
  },
}));

const STATUS_LABELS: Record<FixChipStatus, string> = {
  proposed: 'Proposed',
  excluded: 'Excluded',
  'in-pr': 'In PR',
  resolved: 'Resolved',
};

const STATUS_STYLES: Record<
  FixChipStatus,
  { backgroundColor: string; color: string; border?: string }
> = {
  proposed: { backgroundColor: '#e7f1fa', color: '#0066cc', border: '1px solid #b8daff' },
  excluded: { backgroundColor: '#f5f5f5', color: '#6a6e73', border: '1px solid #d2d2d2' },
  'in-pr': { backgroundColor: '#e8f5e9', color: '#1a7f37', border: '1px solid #a5d6a7' },
  resolved: { backgroundColor: '#1a7f37', color: '#ffffff' },
};

const TIER_STYLES: Record<
  FixType,
  { backgroundColor: string; color: string; outlined?: boolean }
> = {
  auto: { backgroundColor: '#4caf50', color: '#ffffff' },
  ai: { backgroundColor: '#2196f3', color: '#ffffff' },
  manual: { backgroundColor: 'transparent', color: '#6a6e73', outlined: true },
};

export interface FixChipStyledProps {
  remediationClass: number;
  enableAi: boolean;
  mode?: 'tier' | 'status';
  status?: FixChipStatus;
}

export const FixChipStyled = ({
  remediationClass,
  enableAi,
  mode = 'tier',
  status = 'proposed',
}: FixChipStyledProps) => {
  const classes = useStyles();

  if (mode === 'status') {
    const style = STATUS_STYLES[status];
    return (
      <Chip
        size="small"
        label={STATUS_LABELS[status]}
        className={classes.chip}
        style={{
          backgroundColor: style.backgroundColor,
          color: style.color,
          border: style.border,
        }}
      />
    );
  }

  const fixType = effectiveFixType(remediationClass, enableAi);
  const label = fixMethodLabel(fixType);
  const tooltip = fixMethodTooltip(fixType);
  const tierStyle = TIER_STYLES[fixType ?? 'manual'];

  return (
    <Tooltip title={tooltip}>
      <Chip
        size="small"
        label={label}
        variant={tierStyle.outlined ? 'outlined' : 'default'}
        className={classes.chip}
        style={{
          backgroundColor: tierStyle.outlined ? undefined : tierStyle.backgroundColor,
          color: tierStyle.color,
          borderColor: tierStyle.outlined ? '#d2d2d2' : undefined,
        }}
      />
    </Tooltip>
  );
};
