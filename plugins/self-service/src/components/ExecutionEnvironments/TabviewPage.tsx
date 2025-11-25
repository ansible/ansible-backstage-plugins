import { useState, useEffect } from 'react';
import { Header, Page, HeaderTabs, Content } from '@backstage/core-components';
import { Typography, Box, makeStyles } from '@material-ui/core';
import { useLocation } from 'react-router-dom';
import CategoryOutlinedIcon from '@material-ui/icons/CategoryOutlined';
import CreateComponentIcon from '@material-ui/icons/AddCircleOutline';
import { CreateContent } from './create/CreateContent';
import { EntityCatalogContent } from './catalog/CatalogContent';

const useStyles = makeStyles(() => ({
  tabContainer: {
    '& .MuiTab-root': {
      minWidth: '200px',
      padding: '12px 40px',
      fontSize: '16px',
    },
  },
  tabWithIcon: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
}));

export const EEHeader = () => {
  const headerTitle = (
    <Box style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <Typography
        variant="h4"
        component="h1"
        style={{ fontWeight: 'bold', fontSize: '2rem' }}
      >
        Execution Environments definition files
      </Typography>
      <Box
        style={{
          backgroundColor: 'transparent',
          color: 'inherit',
          padding: '4px 12px',
          borderRadius: '20px',
          fontSize: '12px',
          border: '1px solid #1976d2',
        }}
      >
        Technology Preview
      </Box>
    </Box>
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

const tabs = [
  { id: 0, label: 'Catalog', icon: <CategoryOutlinedIcon /> },
  { id: 1, label: 'Create', icon: <CreateComponentIcon /> },
];

export const EETabs: React.FC = () => {
  const classes = useStyles();
  const location = useLocation();

  // Check if tab index is provided in navigation state
  const initialState = (location.state as { tabIndex?: number })?.tabIndex ?? 0;
  const [selectedTab, setSelectedTab] = useState(initialState);

  // Update selected tab if navigation state changes
  useEffect(() => {
    const tabIndex = (location.state as { tabIndex?: number })?.tabIndex;
    if (tabIndex !== undefined) {
      setSelectedTab(tabIndex);
    }
  }, [location.state]);

  const onTabSelect = (index: number) => {
    setSelectedTab(index);
  };

  // Determine which content to show based on selected tab
  const renderContent = () => {
    switch (selectedTab) {
      case 0:
        return <EntityCatalogContent onTabSwitch={setSelectedTab} />;
      case 1:
        return <CreateContent />;
      default:
        return <EntityCatalogContent onTabSwitch={setSelectedTab} />;
    }
  };

  return (
    <Page themeId="app">
      <EEHeader />
      <HeaderTabs
        selectedIndex={selectedTab}
        onChange={onTabSelect}
        tabs={
          tabs.map(({ label, icon }) => ({
            id: label.toLowerCase(),
            label: (
              <Box className={classes.tabWithIcon}>
                {icon}
                {label}
              </Box>
            ),
          })) as any
        }
      />
      <Content>{renderContent()}</Content>
    </Page>
  );
};
