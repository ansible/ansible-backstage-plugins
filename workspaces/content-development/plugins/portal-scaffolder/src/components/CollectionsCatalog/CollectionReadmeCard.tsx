import { Box, Card, Typography, CircularProgress } from '@material-ui/core';
import DescriptionOutlinedIcon from '@material-ui/icons/DescriptionOutlined';
import { MarkdownContent } from '@backstage/core-components';

import { CollectionReadmeCardProps } from './types';
import { useCollectionsStyles } from './styles';

export const CollectionReadmeCard = ({
  readmeContent,
  isLoading = false,
  isHtml = false,
}: CollectionReadmeCardProps) => {
  const classes = useCollectionsStyles();

  const renderContent = () => {
    if (isLoading) {
      return (
        <Box className={classes.readmeLoading}>
          <CircularProgress size={32} />
        </Box>
      );
    }

    if (readmeContent) {
      if (isHtml) {
        return (
          <Box
            className={classes.readmeHtmlContent}
            dangerouslySetInnerHTML={{ __html: readmeContent }}
          />
        );
      }
      return <MarkdownContent content={readmeContent} />;
    }

    return (
      <Box className={classes.readmeEmpty}>
        <Typography variant="body2" color="textSecondary">
          No README content available for this collection.
        </Typography>
      </Box>
    );
  };

  return (
    <Card className={classes.readmeCard} variant="outlined">
      <Box className={classes.readmeCardHeader}>
        <DescriptionOutlinedIcon style={{ fontSize: '1.25rem' }} />
        <Typography className={classes.readmeCardTitle}>README</Typography>
      </Box>

      <Box className={classes.readmeCardContent}>{renderContent()}</Box>
    </Card>
  );
};
