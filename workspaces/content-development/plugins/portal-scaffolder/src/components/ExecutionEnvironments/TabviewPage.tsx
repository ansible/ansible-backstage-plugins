import { useNavigate } from 'react-router-dom';
import { Typography } from '@material-ui/core';
import { Header, Page, Content } from '@backstage/core-components';
import { EntityCatalogContent } from './catalog/CatalogContent';

export const EEHeader = () => {
  const headerTitle = (
    <Typography
      variant="h4"
      component="h1"
      style={{ fontWeight: 'bold', fontSize: '2rem' }}
    >
      Execution Environments definition files
    </Typography>
  );

  return (
    <Header
      title={headerTitle}
      pageTitleOverride="Execution Environments Definition Files"
      style={{
        fontFamily: 'Red Hat Text',
        color: 'white',
        paddingBottom: '16px',
      }}
    />
  );
};

/** Legacy host wrapper for the EE definitions catalog. */
export const EETabs = () => {
  const navigate = useNavigate();
  return (
    <Page themeId="app">
      <EEHeader />
      <Content>
        <EntityCatalogContent onTabSwitch={() => navigate('/create')} />
      </Content>
    </Page>
  );
};
