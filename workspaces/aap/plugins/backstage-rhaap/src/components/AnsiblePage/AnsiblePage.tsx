/*
 * Copyright 2024 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useEffect, useState } from 'react';
import { Header, Page, HeaderTabs, Content } from '@backstage/core-components';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router';
import { Fab, Typography, makeStyles } from '@material-ui/core';
import Comment from '@material-ui/icons/Comment';
import { useApi, configApiRef } from '@backstage/core-plugin-api';

import { EntityOverviewContent } from '../OverviewContent';
import { EntityCatalogContent } from '../CatalogContent';
import { EntityCreateContent } from '../CreateContent';
import { EntityLearnContent } from '../LearnContent';
import RatingsFeedbackModal from './RatingsFeedbackModal';

const feedbackStyles = makeStyles({
  feedback_btn: {
    position: 'fixed',
    bottom: '24px',
    right: '30px',
    padding: '10px !important',
    zIndex: 99999,
    textTransform: 'none',
  },
  mb_2: {
    marginBottom: '2px',
  },
});

export const AnsibleHeader = () => {
  const headerTitle =
    'Welcome to the Ansible plug-ins for Red Hat Developer Hub';
  const headerSubtitle = (
    <Typography
      component="span"
      variant="subtitle1"
      data-testid="ansible-header"
    >
      This Ansible out-of-the-box experience accelerates content creation and
      meets you where you are in the development process.
    </Typography>
  );

  return (
    <Header
      title={headerTitle}
      subtitle={headerSubtitle}
      style={{ fontFamily: 'Red Hat Text', color: 'white' }}
    />
  );
};

const tabs = [
  { id: 0, label: 'Overview', nav: 'overview' },
  { id: 1, label: 'My Items', nav: 'myitems' },
  { id: 2, label: 'Create', nav: 'create' },
  { id: 3, label: 'Learn', nav: 'learn' },
];

export const AnsiblePage = () => {
  const classes = feedbackStyles();
  const navigate = useNavigate();
  const param = useParams();
  const section = param['*'];
  const config = useApi(configApiRef);

  const [open, setOpen] = useState(false);
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const feedbackEnabled =
    config.getOptionalBoolean('ansible.feedback.enabled') ?? false;

  const selectedTabIndex = tabs.findIndex(item => item.nav === section);
  const [selectedTab, setSelectedTab] = useState<any>(0);

  useEffect(() => {
    if (selectedTabIndex > -1) {
      setSelectedTab(tabs[selectedTabIndex]);
    }
  }, [selectedTabIndex]);

  const onTabSelect = (index: number) => {
    setSelectedTab(tabs[index]);
    navigate(tabs[index].nav);
  };

  return section === '' ? (
    <Navigate to="overview" />
  ) : (
    <Page themeId="app">
      <AnsibleHeader />
      <HeaderTabs
        selectedIndex={selectedTab.id}
        onChange={onTabSelect}
        tabs={tabs.map(({ nav, label }) => ({
          id: nav,
          label,
        }))}
      />

      <Content>
        <Routes>
          <Route path="/">
            <Route path="overview" element={<EntityOverviewContent />} />
            <Route path="myitems" element={<EntityCatalogContent />} />
            <Route path="create" element={<EntityCreateContent />} />
            <Route path="learn" element={<EntityLearnContent />} />
          </Route>
        </Routes>
        {feedbackEnabled && (
          <>
            <Fab
              variant="extended"
              size="small"
              color="primary"
              className={classes.feedback_btn}
              onClick={handleOpen}
              disableRipple
            >
              <Comment />
              &nbsp;
              <Typography component="span" className={classes.mb_2}>
                Feedback
              </Typography>
            </Fab>
            {open && <RatingsFeedbackModal handleClose={handleClose} />}
          </>
        )}
      </Content>
    </Page>
  );
};
