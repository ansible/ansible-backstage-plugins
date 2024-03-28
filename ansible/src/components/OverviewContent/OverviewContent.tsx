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

import React from 'react';
import { InfoCard } from '@backstage/core-components';
import { Grid, Typography, makeStyles } from '@material-ui/core';

const useStyles = makeStyles({
  container: {
    backgroundColor: 'default',
    padding: '20px',
  },
  text: {
    color: 'white',
    marginTop: '5px',
    fontSize: '15px', // Increase the font size as needed
  },
  divider: {
    margin: '20px 0',
    backgroundColor: 'white', // Make the divider white so it stands out on the light blue background
  },
});

const EntityGettingStartedCard = () => {
  const classes = useStyles();
  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <InfoCard title="Getting started">
          <Typography variant="body1" className={classes.text}>
            Welcome to Ansible! <br />
            Let's help you get on your way and become an Ansible developer
          </Typography>
        </InfoCard>
      </Grid>
    </Grid>
  )
}

export const EntityOverviewContent = () => {
  return (
    <EntityGettingStartedCard />
  );
};
