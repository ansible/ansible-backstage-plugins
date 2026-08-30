import { Page, Content, Header, InfoCard } from '@backstage/core-components';
import { Typography, Box, makeStyles } from '@material-ui/core';
import AssessmentIcon from '@material-ui/icons/Assessment';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { useRouteRef } from '@backstage/core-plugin-api';
import { gitRepositoriesViewPermission } from '@ansible/backstage-rhaap-common/permissions';
import { rootRouteRef } from '../../routes';
import { useGitRepositoriesExtensions } from '../GitRepositories/useGitRepositoriesExtensions';

const useStyles = makeStyles(theme => ({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(3),
  },
  heroCard: {
    padding: theme.spacing(4),
    textAlign: 'center',
  },
  icon: {
    fontSize: 64,
    color: theme.palette.primary.main,
    marginBottom: theme.spacing(2),
  },
  description: {
    maxWidth: 600,
    margin: '0 auto',
    color: theme.palette.text.secondary,
  },
}));

const ContentQualityContent = () => {
  const classes = useStyles();
  const rootLink = useRouteRef(rootRouteRef);
  const extensionsApi = useGitRepositoriesExtensions();

  const qualityTab = extensionsApi
    .getPageTabs()
    .find(tab => tab.path === 'quality');

  const repositoryDetailPath = (entityName: string, ruleId?: string) => {
    const base = `${rootLink()}/repositories/${entityName}?tab=quality-activity`;
    return ruleId ? `${base}&rule=${encodeURIComponent(ruleId)}` : base;
  };

  if (qualityTab) {
    return <>{qualityTab.render({ repositoryDetailPath })}</>;
  }

  return (
    <Box className={classes.container}>
      <InfoCard>
        <Box className={classes.heroCard}>
          <AssessmentIcon className={classes.icon} />
          <Typography variant="h4" gutterBottom>
            Estate-Wide Content Quality
          </Typography>
          <Typography variant="body1" className={classes.description}>
            Monitor and improve the quality of your Ansible content across all
            repositories. View aggregated health scores, findings, and
            remediation recommendations powered by APME (Ansible Policy &
            Modernization Engine).
          </Typography>
        </Box>
      </InfoCard>
    </Box>
  );
};

export const ContentQualityPage = () => {
  return (
    <Page themeId="app">
      <Header title="Content quality" />
      <Content>
        <ContentQualityContent />
      </Content>
    </Page>
  );
};

export const ContentQualityRoutesPage = () => {
  return (
    <RequirePermission permission={gitRepositoriesViewPermission}>
      <ContentQualityPage />
    </RequirePermission>
  );
};
