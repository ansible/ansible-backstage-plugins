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

import { useMemo } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemText,
  Paper,
  Typography,
  makeStyles,
} from '@material-ui/core';
import type { BranchFileChange } from '../BranchFileChangesPanel';
import { DiffView } from '../DiffView';

const useStyles = makeStyles(theme => ({
  panel: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
    border: `1px solid ${theme.palette.divider}`,
  },
  panelModal: {
    padding: 0,
    marginBottom: 0,
    border: 'none',
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    marginBottom: theme.spacing(2),
  },
  body: {
    display: 'grid',
    gridTemplateColumns: 'minmax(160px, 220px) minmax(0, 1fr)',
    gap: theme.spacing(2),
    alignItems: 'stretch',
    [theme.breakpoints.down('sm')]: {
      gridTemplateColumns: '1fr',
    },
  },
  bodyModal: {
    gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)',
    flex: 1,
    minHeight: 0,
    height: '100%',
  },
  fileList: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    maxHeight: 320,
    overflow: 'auto',
    padding: 0,
  },
  fileListModal: {
    maxHeight: 'none',
    height: '100%',
    overflow: 'auto',
  },
  fileItem: {
    cursor: 'pointer',
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  fileItemSelected: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(43, 154, 243, 0.12)'
        : 'rgba(43, 154, 243, 0.08)',
  },
  fileName: {
    fontFamily: 'monospace',
    fontSize: 12,
    wordBreak: 'break-all',
  },
  viewer: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(1.5),
    minWidth: 0,
  },
  viewerModal: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    padding: theme.spacing(1),
  },
  diffFill: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  viewerHeader: {
    marginBottom: theme.spacing(1),
    flexShrink: 0,
  },
  patchCaption: {
    marginTop: theme.spacing(1),
    flexShrink: 0,
  },
}));

export interface RemediationReviewWorkspaceProps {
  files: BranchFileChange[];
  selectedFile: string | null;
  onSelectedFileChange: (filePath: string) => void;
  /** Wider layout when nested in the patches dialog. */
  variant?: 'inline' | 'modal';
  /** Hide inline header when nested in dialog. */
  hideHeader?: boolean;
}

function pluralLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function patchCaption(change: BranchFileChange): string {
  if (change.diff?.trim() || change.after?.trim()) {
    return 'Push applies this patch. Edit in Dev Spaces after push.';
  }
  return 'Patch applies when you push the remediation branch.';
}

export const RemediationReviewWorkspace = ({
  files,
  selectedFile,
  onSelectedFileChange,
  variant = 'inline',
  hideHeader = false,
}: RemediationReviewWorkspaceProps) => {
  const classes = useStyles();
  const isModal = variant === 'modal';

  const sortedFiles = useMemo(
    () => [...files].sort((a, b) => a.file.localeCompare(b.file)),
    [files],
  );

  const activeFile =
    selectedFile && sortedFiles.some(f => f.file === selectedFile)
      ? selectedFile
      : (sortedFiles[0]?.file ?? null);
  const activeChange = sortedFiles.find(f => f.file === activeFile);

  const hasDiff = Boolean(activeChange?.diff?.trim());
  const hasBeforeAfter = Boolean(
    activeChange?.before?.trim() && activeChange?.after?.trim(),
  );

  const shell = (
    <>
      {!hideHeader && (
        <Box className={classes.header}>
          <Typography variant="subtitle2">
            Prepared patches · {pluralLabel(sortedFiles.length, 'file')}
          </Typography>
          <Typography variant="caption" color="textSecondary" display="block">
            Read-only preview. Push applies patches; edit in Dev Spaces after
            push.
          </Typography>
        </Box>
      )}

      {sortedFiles.length === 0 ? (
        <Typography variant="body2" color="textSecondary">
          No prepared file changes to view.
        </Typography>
      ) : (
        <Box
          className={
            isModal ? `${classes.body} ${classes.bodyModal}` : classes.body
          }
        >
          <List
            className={
              isModal
                ? `${classes.fileList} ${classes.fileListModal}`
                : classes.fileList
            }
            dense
            disablePadding
          >
            {sortedFiles.map(change => {
              const selected = change.file === activeFile;
              return (
                <ListItem
                  key={change.file}
                  button
                  className={
                    selected
                      ? `${classes.fileItem} ${classes.fileItemSelected}`
                      : classes.fileItem
                  }
                  selected={selected}
                  onClick={() => onSelectedFileChange(change.file)}
                >
                  <ListItemText
                    primary={change.file}
                    primaryTypographyProps={{
                      className: classes.fileName,
                    }}
                  />
                </ListItem>
              );
            })}
          </List>

          {activeChange && (
            <Box
              className={
                isModal ? `${classes.viewer} ${classes.viewerModal}` : classes.viewer
              }
            >
              <Box className={classes.viewerHeader}>
                <Typography
                  variant="caption"
                  style={{ fontFamily: 'monospace', fontWeight: 600 }}
                >
                  {activeChange.file}
                </Typography>
              </Box>
              <Box className={isModal ? classes.diffFill : undefined}>
                {hasDiff ? (
                  <DiffView
                    diff={activeChange.diff}
                    title={isModal ? undefined : 'Changes'}
                    fillHeight={isModal}
                  />
                ) : hasBeforeAfter ? (
                  <DiffView
                    before={activeChange.before}
                    after={activeChange.after}
                    title={isModal ? undefined : 'Changes'}
                    fillHeight={isModal}
                  />
                ) : null}
              </Box>
              <Typography
                variant="body2"
                color="textSecondary"
                className={classes.patchCaption}
              >
                {patchCaption(activeChange)}
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </>
  );

  if (isModal) {
    return (
      <Box id="apme-review-workspace" className={classes.panelModal}>
        {shell}
      </Box>
    );
  }

  return (
    <Paper
      id="apme-review-workspace"
      className={classes.panel}
      elevation={0}
    >
      {shell}
    </Paper>
  );
};
