import React from 'react';
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
        pageTitleOverride="Ansible Portal - Register Components"
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
                link: 'https://github.com/ansible/ansible-rhdh-templates/blob/main/generic-seed/template.yaml',
              }}
            >
              <Typography variant="body2" paragraph>
                To add a template to Ansible Portal, provide the URL to a source
                code repository, or a link to an existing entity file.
              </Typography>

              <Typography variant="body2" paragraph>
                The wizard analyzes the file, previews the entities, and adds
                them to the Ansible Portal catalog.
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
