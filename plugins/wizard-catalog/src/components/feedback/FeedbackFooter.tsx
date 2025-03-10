import React from 'react';
import Fab from '@mui/material/Fab';
import Typography from '@mui/material/Typography';
import CommentIcon from '@mui/icons-material/Comment';
import RatingsFeedbackModal from './RatingsFeedbackModal';
import { useTheme } from '@mui/material/styles';

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
          background: theme.palette.mode === 'light' ? '#0066CC' : '#9CC9FF',
          color:
            theme.palette.mode === 'light' ? '#ffffff' : 'rgba(0, 0, 0, 0.87)',
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
