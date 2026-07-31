import { Box, Card, Typography, CircularProgress } from '@material-ui/core';
import DescriptionOutlinedIcon from '@material-ui/icons/DescriptionOutlined';
import { MarkdownContent } from '@backstage/core-components';

import { useCollectionsStyles } from '../CollectionsCatalog/styles';

export interface RepositoryReadmeCardProps {
  readmeContent: string;
  isLoading?: boolean;
}

export const RepositoryReadmeCard = ({
  readmeContent,
  isLoading = false,
}: RepositoryReadmeCardProps) => {
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
      // readmeHtmlContent styles headings/lists — Backstage MarkdownContent
      // only styles tables/links; Portal/theme resets flatten h1–h6 and ul.
      return (
        <MarkdownContent
          content={readmeContent}
          className={classes.readmeHtmlContent}
        />
      );
    }

    return (
      <Box className={classes.readmeEmpty}>
        <Typography variant="body2" color="textSecondary">
          Readme Not Available
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
