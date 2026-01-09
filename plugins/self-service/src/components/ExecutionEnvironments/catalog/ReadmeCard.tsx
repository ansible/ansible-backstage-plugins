import { Box, Card, CardContent } from '@material-ui/core';
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
    maxWidth: '60vw',
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
      <Card variant="outlined">
        <CardContent style={{ flex: 1, minHeight: 0 }}>
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
