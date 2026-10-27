import { useState } from 'react';
import { Fab, Typography, useTheme } from '@material-ui/core';
import CommentIcon from '@material-ui/icons/Comment';
import { useApi, configApiRef } from '@backstage/core-plugin-api';
import RatingsFeedbackModal from './RatingsFeedbackModal';

export const FeedbackFooter = () => {
  const theme = useTheme();
  const config = useApi(configApiRef);
  const [open, setOpen] = useState(false);

  const feedbackEnabled =
    config.getOptionalBoolean('ansible.feedback.enabled') ?? false;

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  if (!feedbackEnabled) {
    return null;
  }

  return (
    <>
      <Fab
        variant="extended"
        size="small"
        onClick={handleOpen}
        disableRipple
        style={{
          position: 'fixed',
          bottom: '10px',
          right: '20px',
          padding: '10px',
          zIndex: 99999,
          textTransform: 'none',
          borderRadius: 17,
          background: theme.palette.type === 'light' ? '#0066CC' : '#9CC9FF',
          color:
            theme.palette.type === 'light' ? '#ffffff' : 'rgba(0, 0, 0, 0.87)',
        }}
      >
        <CommentIcon style={{ marginBottom: '2px' }} />
        &nbsp;
        <Typography component="span">Feedback</Typography>
      </Fab>
      {open && <RatingsFeedbackModal handleClose={handleClose} open={open} />}
    </>
  );
};
