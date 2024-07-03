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
    fill: theme.palette.type === 'light' ? '#06C' : 'white',
  },
}));

export const WorkspaceIcon = () => {
  const classes = useStyles();

  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g filter="url(#filter0_d_1031_9010)">
        <path className={classes.path} d="M48 30H32C30.9 30 30.01 30.9 30.01 32L30 44C30 45.1 30.9 46 32 46H48C49.1 46 50 45.1 50 44V32C50 30.9 49.1 30 48 30ZM32 35H42.5V38.5H32V35ZM32 40.5H42.5V44H32V40.5ZM48 44H44.5V35H48V44Z" fill="#0066CC"/>
      </g>
      <defs>
        <filter id="filter0_d_1031_9010" x="0" y="0" width="80" height="80" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix"/>
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
          <feOffset dy="2"/>
          <feGaussianBlur stdDeviation="4"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.15 0"/>
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_1031_9010"/>
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_1031_9010" result="shape"/>
        </filter>
      </defs>
    </svg>
  );
};

export default WorkspaceIcon;
