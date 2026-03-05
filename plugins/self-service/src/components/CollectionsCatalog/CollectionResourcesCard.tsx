import { Box, Card, CardContent, Typography, Link } from '@material-ui/core';
import DescriptionOutlinedIcon from '@material-ui/icons/DescriptionOutlined';
import MenuBookOutlinedIcon from '@material-ui/icons/MenuBookOutlined';
import LinkIcon from '@material-ui/icons/Link';
import GitHubIcon from '@material-ui/icons/GitHub';
import BugReportOutlinedIcon from '@material-ui/icons/BugReportOutlined';
import HomeOutlinedIcon from '@material-ui/icons/HomeOutlined';
import CodeIcon from '@material-ui/icons/Code';

import { CollectionResourcesCardProps } from './types';
import { useCollectionsStyles } from './styles';

const getLinkIcon = (title: string, url: string) => {
  const titleLower = title.toLowerCase();
  const urlLower = url.toLowerCase();

  if (titleLower.includes('readme')) {
    return DescriptionOutlinedIcon;
  }
  if (titleLower.includes('doc') || titleLower.includes('documentation')) {
    return MenuBookOutlinedIcon;
  }
  if (titleLower.includes('github') || urlLower.includes('github.com')) {
    return GitHubIcon;
  }
  if (titleLower.includes('issue') || titleLower.includes('bug')) {
    return BugReportOutlinedIcon;
  }
  if (titleLower.includes('home') || titleLower.includes('homepage')) {
    return HomeOutlinedIcon;
  }
  if (
    titleLower.includes('source') ||
    titleLower.includes('code') ||
    titleLower.includes('repository')
  ) {
    return CodeIcon;
  }
  return LinkIcon;
};

export const CollectionResourcesCard = ({
  entity,
}: CollectionResourcesCardProps) => {
  const classes = useCollectionsStyles();

  const entityLinks = entity.metadata.links || [];

  const spec = entity.spec || {};
  const readmeUrl =
    typeof spec.collection_readme_url === 'string'
      ? spec.collection_readme_url
      : undefined;

  const hasReadmeLink = entityLinks.some(link => {
    const title = link.title?.toLowerCase() || '';
    return title.includes('readme');
  });

  const mappedLinks = entityLinks.map(link => ({
    title: link.title || 'Link',
    url: link.url,
    icon: link.icon,
  }));

  const allLinks =
    readmeUrl && !hasReadmeLink
      ? [...mappedLinks, { title: 'README', url: readmeUrl }]
      : mappedLinks;

  if (allLinks.length === 0) {
    return null;
  }

  return (
    <Card className={classes.resourcesCard} variant="outlined">
      <CardContent className={classes.resourcesCardContent}>
        <Typography className={classes.resourcesCardTitle}>
          Resources
        </Typography>

        {allLinks.map((link, index) => {
          const IconComponent = getLinkIcon(link.title, link.url);
          return (
            <Link
              key={`${link.url}-${index}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={classes.resourceLink}
              underline="none"
            >
              <IconComponent className={classes.resourceLinkIcon} />
              <Box>
                <Typography className={classes.resourceLinkText}>
                  {link.title}
                </Typography>
              </Box>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
};
