import { useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Typography } from '@material-ui/core';
import { Header, Page, HeaderTabs, Content } from '@backstage/core-components';
import { useRouteRef } from '@backstage/core-plugin-api';

import { rootRouteRef } from '../../routes';
import { CreateContent } from './create/CreateContent';
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

const tabs = [
  { id: 0, label: 'Catalog', path: 'catalog' },
  { id: 1, label: 'Create', path: 'create' },
];

const getTabIndexFromPath = (pathname: string): number => {
  if (pathname.includes('/ee/create')) return 1;
  return 0;
};

export const EETabs: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const rootLink = useRouteRef(rootRouteRef);

  const selectedTab = useMemo(
    () => getTabIndexFromPath(location.pathname),
    [location.pathname],
  );

  useEffect(() => {
    const tabIndex = (location.state as { tabIndex?: number })?.tabIndex;
    if (tabIndex !== undefined) {
      const tab = tabs[tabIndex];
      if (tab) {
        navigate(`${rootLink()}/ee/${tab.path}`, {
          replace: true,
          state: {},
        });
      }
    }
  }, [location.state, navigate, rootLink]);

  const onTabSelect = useCallback(
    (index: number) => {
      const tab = tabs[index];
      if (tab) {
        navigate(`${rootLink()}/ee/${tab.path}`);
      }
    },
    [navigate, rootLink],
  );

  const handleTabSwitch = useCallback(
    (index: number) => {
      onTabSelect(index);
    },
    [onTabSelect],
  );

  const content = useMemo(() => {
    if (selectedTab === 1) {
      return <CreateContent key="create" />;
    }
    return <EntityCatalogContent key="catalog" onTabSwitch={handleTabSwitch} />;
  }, [selectedTab, handleTabSwitch]);

  return (
    <Page themeId="app">
      <EEHeader />
      <HeaderTabs
        selectedIndex={selectedTab}
        onChange={onTabSelect}
        tabs={tabs.map(({ label }) => ({
          id: label.toLowerCase(),
          label,
        }))}
      />
      <Content>{content}</Content>
    </Page>
  );
};
