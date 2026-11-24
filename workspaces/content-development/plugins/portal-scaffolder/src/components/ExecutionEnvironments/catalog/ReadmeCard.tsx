import { Box, Card, CardContent, Typography } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { MarkdownContent } from '@backstage/core-components';

const useStyles = makeStyles(() => ({
  scrollArea: {
    maxHeight: '58vh',
    overflowY: 'auto',
    paddingRight: 8,

    /* Optional prettier scrollbar */
    '&::-webkit-scrollbar': {
      width: '6px',
    },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: '#bfbfbf',
      borderRadius: '4px',
    },
  },
  markdownScroll: {
    maxHeight: '60vh',
    overflowY: 'auto',
    minHeight: 0,
    paddingRight: 8,

    '&::-webkit-scrollbar': {
      width: 8,
    },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: '#bfbfbf',
      borderRadius: 4,
    },
  },
}));

interface ReadmeCardProps {
  readmeContent: string;
}

export const ReadmeCard: React.FC<ReadmeCardProps> = ({ readmeContent }) => {
  const classes = useStyles();

  return (
    <Box flex={1} style={{ minHeight: 0 }}>
      <Card
        variant="outlined"
        style={{ borderRadius: 16, borderColor: '#D3D3D3' }}
      >
        <CardContent style={{ flex: 1, minHeight: 0 }}>
          <Typography
            variant="h6"
            style={{
              fontWeight: 'bold',
              fontSize: '1.5rem',
              marginBottom: 12,
            }}
          >
            README
          </Typography>
          <div className={classes.scrollArea}>
            <MarkdownContent
              className={classes.markdownScroll}
              content={readmeContent}
            />
          </div>
        </CardContent>
      </Card>
    </Box>
  );
};
