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

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  makeStyles,
} from '@material-ui/core';
import type { BranchFileChange } from '../BranchFileChangesPanel';
import { RemediationReviewWorkspace } from './RemediationReviewWorkspace';

const useStyles = makeStyles(theme => ({
  paper: {
    minHeight: '85vh',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
  },
  title: {
    paddingBottom: theme.spacing(0.5),
    flexShrink: 0,
  },
  content: {
    paddingTop: theme.spacing(1),
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
}));

export interface RemediationReviewDialogProps {
  open: boolean;
  onClose: () => void;
  fileCount: number;
  findingCount: number;
  files: BranchFileChange[];
  selectedFile: string | null;
  onSelectedFileChange: (filePath: string) => void;
}

function pluralCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

export const RemediationReviewDialog = ({
  open,
  onClose,
  fileCount,
  findingCount,
  files,
  selectedFile,
  onSelectedFileChange,
}: RemediationReviewDialogProps) => {
  const classes = useStyles();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      classes={{ paper: classes.paper }}
      aria-labelledby="apme-review-dialog-title"
    >
      <DialogTitle id="apme-review-dialog-title" className={classes.title}>
        View prepared patches
        <Typography variant="body2" color="textSecondary">
          {pluralCount(fileCount, 'file')} ·{' '}
          {pluralCount(findingCount, 'finding')} · read-only
        </Typography>
      </DialogTitle>
      <DialogContent className={classes.content}>
        <RemediationReviewWorkspace
          variant="modal"
          hideHeader
          files={files}
          selectedFile={selectedFile}
          onSelectedFileChange={onSelectedFileChange}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};
