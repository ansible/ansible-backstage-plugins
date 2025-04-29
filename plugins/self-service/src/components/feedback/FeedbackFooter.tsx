import React from 'react';
import RatingsFeedbackModal from './RatingsFeedbackModal';
import { Fab, Typography, useTheme } from '@material-ui/core';
import CommentIcon from '@material-ui/icons/Comment';

export const FeedbackFooter = () => {
  const theme = useTheme();
  const [open, setOpen] = React.useState(false);
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);
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
