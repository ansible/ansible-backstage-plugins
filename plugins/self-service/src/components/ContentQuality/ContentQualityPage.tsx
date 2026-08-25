import { Page, Content, Header, InfoCard } from '@backstage/core-components';
import { Typography, Box, makeStyles } from '@material-ui/core';
import AssessmentIcon from '@material-ui/icons/Assessment';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { gitRepositoriesViewPermission } from '@ansible/backstage-rhaap-common/permissions';

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

export const ContentQualityPage = () => {
  const classes = useStyles();

  return (
    <Page themeId="app">
      <Header title="Content quality" />
      <Content>
        <Box className={classes.container}>
          <InfoCard>
            <Box className={classes.heroCard}>
              <AssessmentIcon className={classes.icon} />
              <Typography variant="h4" gutterBottom>
                Estate-Wide Content Quality
              </Typography>
              <Typography variant="body1" className={classes.description}>
                Monitor and improve the quality of your Ansible content across
                all repositories. View aggregated health scores, findings, and
                remediation recommendations powered by APME (Ansible Policy &
                Modernization Engine).
              </Typography>
            </Box>
          </InfoCard>
        </Box>
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
