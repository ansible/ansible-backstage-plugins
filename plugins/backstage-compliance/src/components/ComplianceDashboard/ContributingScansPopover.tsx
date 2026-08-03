import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Popover, Typography, List, ListItem, ListItemText, Divider, IconButton, Tooltip, Box, makeStyles,
} from '@material-ui/core';
import BookmarkBorderIcon from '@material-ui/icons/BookmarkBorder';
import type { ContributingScan } from '@ansible/backstage-compliance-common/types';
import { scoreColor } from '../shared/colors';

const useStyles = makeStyles(theme => ({
  content: {
    padding: theme.spacing(1, 0),
    minWidth: 320,
    maxWidth: 420,
  },
  header: {
    padding: theme.spacing(1, 2),
    fontWeight: 600,
  },
  listItem: {
    cursor: 'pointer',
    '&:hover': { backgroundColor: theme.palette.action.hover },
  },
  passRate: {
    fontWeight: 600,
  },
  secondaryRate: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
  },
  noPinItem: {
    cursor: 'default',
  },
}));

const getColor = scoreColor;

export interface BaselineInfo {
  remediationProfileName: string;
  rate: number;
  passCount: number;
  ruleCount: number;
}

interface ContributingScansPopoverProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  profileName: string;
  scans: ContributingScan[];
  mode?: 'standard' | 'baseline';
  baselineByInventory?: Map<number, BaselineInfo>;
  onPinBaseline?: (inventoryId: number, inventoryName: string) => void;
}

export const ContributingScansPopover: React.FC<ContributingScansPopoverProps> = ({
  anchorEl,
  onClose,
  profileName,
  scans,
  mode = 'standard',
  baselineByInventory,
  onPinBaseline,
}) => {
  const classes = useStyles();
  const navigate = useNavigate();

  const isBaseline = mode === 'baseline' && baselineByInventory;

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      transformOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <div className={classes.content}>
        <Typography className={classes.header}>
          {profileName} — {isBaseline ? 'Baseline by Inventory' : 'Contributing Scans'}
        </Typography>
        <Divider />
        <List dense disablePadding>
          {scans.map(scan => {
            const bl = isBaseline ? baselineByInventory!.get(scan.inventoryId) : undefined;

            if (isBaseline && !bl) {
              return (
                <ListItem key={scan.scanId} className={classes.noPinItem}>
                  <ListItemText
                    primary={scan.inventoryName}
                    secondary="No baseline pinned"
                  />
                  {onPinBaseline && (
                    <Tooltip title="Pin a baseline for this inventory">
                      <IconButton
                        size="small"
                        onClick={e => {
                          e.stopPropagation();
                          onPinBaseline(scan.inventoryId, scan.inventoryName);
                        }}
                      >
                        <BookmarkBorderIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </ListItem>
              );
            }

            if (isBaseline && bl) {
              return (
                <ListItem
                  key={scan.scanId}
                  className={classes.listItem}
                  onClick={() => { onClose(); navigate(`/compliance/results/${scan.workflowJobId ?? scan.scanId}`); }}
                >
                  <ListItemText
                    primary={`${scan.inventoryName} — ${bl.remediationProfileName}`}
                    secondary={`${bl.passCount}/${bl.ruleCount} baseline rules`}
                  />
                  <Box display="flex" flexDirection="column" alignItems="flex-end">
                    <Typography className={classes.passRate} style={{ color: getColor(bl.rate) }}>
                      {bl.rate}%
                    </Typography>
                    <Typography className={classes.secondaryRate}>
                      Std: {scan.passRate}%
                    </Typography>
                  </Box>
                </ListItem>
              );
            }

            return (
              <ListItem
                key={scan.scanId}
                className={classes.listItem}
                onClick={() => { onClose(); navigate(`/compliance/results/${scan.workflowJobId ?? scan.scanId}`); }}
              >
                <ListItemText
                  primary={scan.inventoryName}
                  secondary={`${scan.passCount}/${scan.ruleCount} rules · ${new Date(scan.timestamp).toLocaleDateString()}`}
                />
                <Typography
                  className={classes.passRate}
                  style={{ color: getColor(scan.passRate) }}
                >
                  {scan.passRate}%
                </Typography>
              </ListItem>
            );
          })}
          {scans.length === 0 && (
            <ListItem>
              <ListItemText primary="No scans found" secondary="Run a scan with this profile to see results here." />
            </ListItem>
          )}
        </List>
      </div>
    </Popover>
  );
};
