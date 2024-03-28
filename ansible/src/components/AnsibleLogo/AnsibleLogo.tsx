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
/*
 * Copyright 2020 The Ansible plugin Authors
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
// @ts-check
// NOTE: This file is intentionally .jsx, so that there is one file in this repo where we make sure .jsx files work.

import React from 'react';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles({
  svg: {
    width: 'auto',
    height: 20,
  },
  path: {
    fill: '#e00',
  },
});

export const AnsibleLogo = () => {
  const classes = useStyles();

  return (
  <svg className={classes.svg} id="uuid-67d648f2-d64e-4759-828c-d38c6bf198c1" xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 38 38">
      <path className={classes.path}
          d="m19,9.125c-5.44531,0-9.875,4.42969-9.875,9.875s4.42969,9.875,9.875,9.875,9.875-4.42969,9.875-9.875-4.42969-9.875-9.875-9.875Zm4.39062,14.36328c-.22266.17773-.53613.18262-.7666.01172l-5.34961-4.02148-1.70508,3.77832c-.10352.23145-.33105.36816-.56934.36816-.08594,0-.17383-.01758-.25684-.05566-.31445-.1416-.45508-.51172-.3125-.82617l2.02051-4.48145c.00293-.00586.00586-.01172.00781-.01758l1.97168-4.36914c.20117-.44922.9375-.44922,1.13867,0l4,8.86816c.11816.25977.04395.56641-.17871.74512Z" />
      <path className={classes.path}
          d="m28,1H10C5.02942,1,1,5.02942,1,10v18c0,4.97052,4.02942,9,9,9h18c4.97058,0,9-4.02948,9-9V10c0-4.97058-4.02942-9-9-9Zm-9,29.125c-6.13477,0-11.125-4.99023-11.125-11.125s4.99023-11.125,11.125-11.125,11.125,4.99023,11.125,11.125-4.99023,11.125-11.125,11.125Z" />
      <polygon className={classes.path}
          points="17.80078 18.31055 21.42969 21.03809 19 15.65234 17.80078 18.31055" />
  </svg>
  );
};

export default AnsibleLogo;
