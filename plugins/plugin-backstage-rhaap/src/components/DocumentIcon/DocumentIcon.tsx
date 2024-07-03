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
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  svg: {
    width: '80',
    height: 80,
  },
  path: {
    fill: theme.palette.type === 'light' ? '#06C' : 'white'
  },
}));

export const DocumentIcon = () => {
  const classes = useStyles()
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path className={classes.path} d="M11.17 2L16 6.83V16H2V2H11.17ZM11.17 0H2C0.9 0 0 0.9 0 2V16C0 17.1 0.9 18 2 18H16C17.1 18 18 17.1 18 16V6.83C18 6.3 17.79 5.79 17.41 5.42L12.58 0.59C12.21 0.21 11.7 0 11.17 0ZM4 12H14V14H4V12ZM4 8H14V10H4V8ZM4 4H11V6H4V4Z" fill="#0066CC"/>
    </svg>
  );
};

export default DocumentIcon;
