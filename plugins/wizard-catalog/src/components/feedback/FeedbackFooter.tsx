import React from 'react';
import Fab from '@mui/material/Fab';
import Typography from '@mui/material/Typography';
import CommentIcon from '@mui/icons-material/Comment';
import RatingsFeedbackModal from './RatingsFeedbackModal';

export const FeedbackFooter = () => {
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
          background: '#0066CC',
          color: '#ffffff',
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
