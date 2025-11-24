import { useState, useEffect } from 'react';
import { Header, Page, HeaderTabs, Content } from '@backstage/core-components';
import { Typography, Box, makeStyles } from '@material-ui/core';
import { useLocation, useNavigate } from 'react-router-dom';
import CategoryOutlinedIcon from '@material-ui/icons/CategoryOutlined';
import CreateComponentIcon from '@material-ui/icons/AddCircleOutline';
import LibraryBooks from '@material-ui/icons/LibraryBooks';
import { CatalogContent } from './catalog/CatalogContent';
import { CreateContent } from './create/CreateContent';
import { DocsContent } from './docs/DocsContent';

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
  { id: 0, label: 'Catalog', icon: <CategoryOutlinedIcon />, path: 'catalog' },
  { id: 1, label: 'Create', icon: <CreateComponentIcon />, path: 'create' },
  { id: 2, label: 'Docs', icon: <LibraryBooks />, path: 'docs' },
];

const getTabIndexFromPath = (pathname: string): number => {
  if (pathname.includes('/ee/create')) return 1;
  if (pathname.includes('/ee/docs')) return 2;
  return 0;
};

export const EETabs: React.FC = () => {
  const classes = useStyles();
  const location = useLocation();
  const navigate = useNavigate();

  const tabIndexFromPath = getTabIndexFromPath(location.pathname);
  const [selectedTab, setSelectedTab] = useState(tabIndexFromPath);

  useEffect(() => {
    const newTabIndex = getTabIndexFromPath(location.pathname);
    setSelectedTab(newTabIndex);
  }, [location.pathname]);

  useEffect(() => {
    const tabIndex = (location.state as { tabIndex?: number })?.tabIndex;
    if (tabIndex !== undefined) {
      setSelectedTab(tabIndex);
      const tab = tabs[tabIndex];
      if (tab) {
        navigate(`/self-service/ee/${tab.path}`, { replace: true });
      }
    }
  }, [location.state, navigate]);

  const onTabSelect = (index: number) => {
    setSelectedTab(index);
    const tab = tabs[index];
    if (tab) {
      navigate(`/self-service/ee/${tab.path}`);
    }
  };

  const handleTabSwitch = (index: number) => {
    onTabSelect(index);
  };

  const renderContent = () => {
    switch (selectedTab) {
      case 0:
        return <CatalogContent onTabSwitch={handleTabSwitch} />;
      case 1:
        return <CreateContent />;
      case 2:
        return <DocsContent />;
      default:
        return <CatalogContent onTabSwitch={handleTabSwitch} />;
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
