/*
 * Copyright Red Hat
 */

import { useCallback, useState } from 'react';
import {
  Box,
  Collapse,
  Paper,
  Typography,
  makeStyles,
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import { DiffView } from '../DiffView';

export type BranchFileChange = {
  file: string;
  before?: string;
  after?: string;
  diff?: string;
};

export interface BranchFileChangesPanelProps {
  files: BranchFileChange[];
  /** Defaults to "Changes on branch". */
  title?: string;
  subtitle?: string;
  branchName?: string;
  /** When true, panel body starts open. Default false. */
  defaultExpanded?: boolean;
}

const useStyles = makeStyles(theme => ({
  panel: {
    padding: theme.spacing(1.5, 2),
    marginBottom: theme.spacing(2),
    border: `1px solid ${theme.palette.divider}`,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
    cursor: 'pointer',
    userSelect: 'none',
    border: 'none',
    background: 'none',
    padding: 0,
    width: '100%',
    textAlign: 'left',
    color: 'inherit',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  fileRow: {
    marginTop: theme.spacing(1),
  },
  fileHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    cursor: 'pointer',
    userSelect: 'none',
    border: 'none',
    background: 'none',
    padding: theme.spacing(0.5, 0),
    width: '100%',
    textAlign: 'left',
    color: 'inherit',
  },
  fileName: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: 600,
  },
  chevron: {
    color: theme.palette.text.secondary,
    flexShrink: 0,
  },
  diffWrap: {
    marginTop: theme.spacing(0.5),
  },
}));

const DEFAULT_SUBTITLE =
  'In-portal diffs are from this remedia session — open the full compare on GitHub for the authoritative branch.';

export const BranchFileChangesPanel = ({
  files,
  title = 'Changes on branch',
  subtitle = DEFAULT_SUBTITLE,
  branchName,
  defaultExpanded = false,
}: BranchFileChangesPanelProps) => {
  const classes = useStyles();
  const [panelOpen, setPanelOpen] = useState(defaultExpanded);
  const [openFiles, setOpenFiles] = useState<Set<string>>(() => new Set());

  const togglePanel = useCallback(() => {
    setPanelOpen(prev => !prev);
  }, []);

  const toggleFile = useCallback((file: string) => {
    setOpenFiles(prev => {
      const next = new Set(prev);
      if (next.has(file)) {
        next.delete(file);
      } else {
        next.add(file);
      }
      return next;
    });
  }, []);

  if (files.length === 0) {
    return null;
  }

  const heading = branchName ? `${title} · ${branchName}` : title;

  return (
    <Paper className={classes.panel} elevation={0}>
      <button
        type="button"
        className={classes.header}
        onClick={togglePanel}
        aria-expanded={panelOpen}
        data-testid="branch-changes-panel-header"
      >
        <Box className={classes.headerText}>
          <Typography variant="subtitle2">{heading}</Typography>
          {subtitle ? (
            <Typography variant="caption" color="textSecondary" display="block">
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {panelOpen ? (
          <ExpandLessIcon className={classes.chevron} fontSize="small" />
        ) : (
          <ExpandMoreIcon className={classes.chevron} fontSize="small" />
        )}
      </button>

      <Collapse in={panelOpen} timeout="auto" unmountOnExit>
        {files.map(change => {
          const fileOpen = openFiles.has(change.file);
          const hasBeforeAfter = Boolean(
            change.before?.trim() || change.after?.trim(),
          );
          return (
            <div key={change.file} className={classes.fileRow}>
              <button
                type="button"
                className={classes.fileHeader}
                onClick={() => toggleFile(change.file)}
                aria-expanded={fileOpen}
                data-testid={`branch-changes-file-${change.file}`}
              >
                {fileOpen ? (
                  <ExpandLessIcon
                    className={classes.chevron}
                    fontSize="small"
                  />
                ) : (
                  <ExpandMoreIcon
                    className={classes.chevron}
                    fontSize="small"
                  />
                )}
                <Typography className={classes.fileName}>
                  {change.file}
                </Typography>
              </button>
              <Collapse in={fileOpen} timeout="auto" unmountOnExit>
                <Box className={classes.diffWrap}>
                  {hasBeforeAfter ? (
                    <DiffView
                      before={change.before}
                      after={change.after}
                      layout="sideBySide"
                    />
                  ) : (
                    <DiffView diff={change.diff} />
                  )}
                </Box>
              </Collapse>
            </div>
          );
        })}
      </Collapse>
    </Paper>
  );
};
