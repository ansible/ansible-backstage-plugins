import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { InfoCard } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import {
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  Chip,
  LinearProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  makeStyles,
} from '@material-ui/core';
import BookmarkIcon from '@material-ui/icons/Bookmark';
import StorageIcon from '@material-ui/icons/Storage';

import { complianceApiRef } from '../../api';
import { scoreColor, STATUS_COLORS } from '../shared/colors';
import { CHIP_SIZES, TABLE_STYLES } from '../shared/chipStyles';
import type { DashboardStats } from '@ansible/backstage-compliance-common/types';

const useStyles = makeStyles(theme => ({
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
    gap: theme.spacing(2),
  },
  filterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
  profileFilter: {
    minWidth: 180,
  },
  profileRow: {
    cursor: 'pointer',
    '&:hover': { backgroundColor: theme.palette.action.hover },
  },
  inventoryCell: {
    verticalAlign: 'middle',
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
  },
  profileCell: {
    verticalAlign: 'middle',
    borderBottom: 'none',
    paddingTop: 6,
    paddingBottom: 6,
  },
  groupBorder: {
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  profileChip: {
    ...CHIP_SIZES.standard,
  },
  baselineChip: {
    ...CHIP_SIZES.micro,
    backgroundColor: 'rgba(0, 102, 204, 0.08)',
    color: STATUS_COLORS.info,
  },
  scoreChip: {
    ...CHIP_SIZES.standard,
    fontWeight: 600,
  },
  nameCell: {
    fontWeight: 500,
  },
  muted: {
    color: theme.palette.text.secondary,
  },
  empty: {
    textAlign: 'center',
    padding: theme.spacing(6),
    color: theme.palette.text.secondary,
  },
}));

export const InventoriesList: React.FC = () => {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useApi(complianceApiRef);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileFilter, setProfileFilter] = useState<string>('');
  useEffect(() => {
    api.getDashboardStats()
      .then(setStats)
      .catch(err => { console.error('Failed to load inventories:', err); })
      .finally(() => setLoading(false));
  }, [api]);

  const allInventories = useMemo(() => stats?.byInventory ?? [], [stats]);

  const profileNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const inv of allInventories) {
      for (const ps of inv.profileScores) {
        names.set(ps.profileId, ps.name);
      }
    }
    return names;
  }, [allInventories]);

  const inventories = useMemo(() => {
    if (!profileFilter) return allInventories;
    return allInventories.filter(inv =>
      inv.profileScores.some(ps => ps.profileId === profileFilter),
    );
  }, [allInventories, profileFilter]);

  if (loading) return <LinearProgress />;

  if (allInventories.length === 0) {
    return (
      <InfoCard title="Inventories">
        <div className={classes.empty}>
          <StorageIcon style={{ fontSize: 64, color: STATUS_COLORS.neutral, marginBottom: 16 }} />
          <Typography variant="h6" color="textSecondary" gutterBottom>
            No inventories with scan data
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Run a compliance scan against an inventory to see it here.
          </Typography>
        </div>
      </InfoCard>
    );
  }

  return (
    <InfoCard title="Inventories">
      <div className={classes.headerRow}>
        <Typography variant="body2" color="textSecondary">
          Inventories with compliance scan data. Click to see per-host compliance.
        </Typography>
      </div>

      <div className={classes.filterRow}>
        <FormControl variant="outlined" size="small" className={classes.profileFilter}>
          <InputLabel id="inv-profile-filter">Profile</InputLabel>
          <Select
            labelId="inv-profile-filter"
            value={profileFilter}
            onChange={e => setProfileFilter(e.target.value as string)}
            label="Profile"
          >
            <MenuItem value="">All Profiles</MenuItem>
            {Array.from(profileNames.entries()).map(([id, name]) => (
              <MenuItem key={id} value={id}>{name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="caption" className={classes.muted}>
          {inventories.length} inventor{inventories.length !== 1 ? 'ies' : 'y'}
        </Typography>
      </div>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell style={TABLE_STYLES.header}>Inventory</TableCell>
              <TableCell style={TABLE_STYLES.header}>Active Scans</TableCell>
              <TableCell style={TABLE_STYLES.header}>Baseline</TableCell>
              <TableCell style={TABLE_STYLES.header}>Baseline Compliance</TableCell>
              <TableCell style={TABLE_STYLES.header}>Standard Compliance</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {inventories.map(inv => {
              const count = inv.profileScores.length;
              return inv.profileScores.map((ps, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === count - 1;
                const cellClass = `${classes.profileCell} ${isLast ? classes.groupBorder : ''}`;
                return (
                  <TableRow
                    key={`${inv.inventoryId}-${ps.profileId}`}
                    className={classes.profileRow}
                    hover
                    onClick={() => navigate(`/compliance/inventories/${inv.inventoryId}?profile=${ps.scanTags || ps.profileId}`)}
                  >
                    {isFirst && (
                      <TableCell rowSpan={count} className={classes.inventoryCell}>
                        <Typography variant="body2" className={classes.nameCell}>
                          {inv.inventoryName}
                        </Typography>
                      </TableCell>
                    )}
                    <TableCell className={cellClass}>
                      <Chip label={ps.name} size="small" variant="outlined" className={classes.profileChip} />
                    </TableCell>
                    <TableCell className={cellClass}>
                      {ps.baseline ? (
                        <Chip
                          icon={<BookmarkIcon style={{ fontSize: 14 }} />}
                          label={ps.baseline.remediationProfileName}
                          size="small"
                          className={classes.baselineChip}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell className={cellClass}>
                      {ps.baseline ? (
                        <Chip
                          label={`${ps.baseline.rate}%`}
                          size="small"
                          className={classes.scoreChip}
                          style={{ backgroundColor: scoreColor(ps.baseline.rate), color: '#fff' }}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell className={cellClass}>
                      <Chip
                        label={`${ps.rate}%`}
                        size="small"
                        className={classes.scoreChip}
                        style={{ backgroundColor: scoreColor(ps.rate), color: '#fff' }}
                      />
                    </TableCell>
                  </TableRow>
                );
              });
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </InfoCard>
  );
};
