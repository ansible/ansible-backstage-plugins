import { Content, Header, InfoCard, Page } from '@backstage/core-components';
import { Grid, makeStyles, Typography } from '@material-ui/core';
import { ImportStepper } from '@backstage/plugin-catalog-import';

const headerStyles = makeStyles(theme => ({
  header_title_color: {
    color: theme.palette.type === 'light' ? 'rgba(0, 0, 0, 0.87)' : '#ffffff',
  },
  header_subtitle: {
    display: 'inline-block',
    color: theme.palette.type === 'light' ? 'rgba(0, 0, 0, 0.87)' : '#ffffff',
    opacity: 0.8,
    maxWidth: '75ch',
    marginTop: '8px',
    fontWeight: 500,
    lineHeight: 1.57,
  },
}));

export const CatalogImport = () => {
  const classes = headerStyles();
  return (
    <Page themeId="tools">
      <Header
        pageTitleOverride="Register Components"
        title={<span className={classes.header_title_color}>Add Template</span>}
        subtitle={
          <span className={classes.header_subtitle}>
            Add a new template to the catalog for users in your AAP organization
            to use.
          </span>
        }
        style={{ background: 'inherit' }}
      />
      <Content>
        <Grid container spacing={2} direction="row-reverse">
          <Grid item xs={12} md={4} lg={6} xl={8}>
            <InfoCard
              title="About"
              titleTypographyProps={{ component: 'h3' }}
              deepLink={{
                title: 'View template YAML example',
                link: 'https://red.ht/portal_template_example',
              }}
            >
              <Typography variant="body2" paragraph>
                Import custom templates. Provide the URL to the existing
                Template YAML file hosted in a source code repository. The
                import process will analyze the file(s), and add them to
                automation portal. Please remember that managing these custom
                templates will require automation portal RBAC rules.{' '}
                <a
                  href="https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/latest/html/using_self-service_automation_portal/self-service-working-templates_aap-self-service-using#self-service-add-template_self-service-working-templates

"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#1976d2', textDecoration: 'underline' }}
                >
                  Learn more about configuring RBAC rules for external templates
                  in our documentation.
                </a>
              </Typography>
            </InfoCard>
          </Grid>

          <Grid item xs={12} md={8} lg={6} xl={4}>
            <ImportStepper />
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
