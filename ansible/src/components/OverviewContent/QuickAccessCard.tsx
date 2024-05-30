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
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  ButtonProps,
  Grid,
  Typography,
  makeStyles,
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';

import {
  IQuickAccessLinks,
  allData
} from './quickAccessData';
import { useNavigate } from 'react-router';
import OpenInNew from '@material-ui/icons/OpenInNew';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { Config } from '@backstage/config';

export type QuickAccessProps = {
  config: Config;
  data: IQuickAccessLinks;
  index: number;
  expanded?: boolean;
};

const useStyles = makeStyles(theme => ({
  ml25: {
    marginLeft: '25px',
  },
  flex: {
    display: 'flex'
  },
  fontSize14: {
    fontSize: '14px',
  },
  fw_700: {
    fontWeight: 700,
  },
  description: {
    marginBottom: '30px',
  },
  t_align_c: {
    textAlign: 'center',
  },
  link: {
    display: 'flex',
    gap: '24px',
    listStyle: 'none',
    paddingLeft: '16px',
  },
  a_link: {
    display: 'block',
    margin: '4px 8px',
    textDecoration: 'none',
  },
  icon_style: {
    display: 'inline-block',
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: theme.palette.type === 'light' ? '#F8F8F8' : '',
    textAlign: 'center',
    lineHeight: '32px',
    boxShadow:
      '0px 2px 1px -1px rgba(0,0,0,0.2),0px 1px 1px 0px rgba(0,0,0,0.14),0px 1px 3px 0px rgba(0,0,0,0.12)',
  },
  icon_align: {
    color: theme.palette.type === 'light' ? '#06C' : 'white',
    position: 'relative',
    top: '50%',
    transform: 'translateY(-40%)',
  },
  link_label: {
    color: theme.palette.type === 'light' ? '#181818' : 'white',
    maxWidth: '96px',
    fontSize: '12px',
    wordBreak: 'break-word',
    marginTop: '8px',
  },
}));

const QuickAccessAccordion = ({ data, index, expanded, config }: QuickAccessProps) => {
  const classes = useStyles();
  const navigate = useNavigate();
  let btnUrl = data.button?.url;
  if (btnUrl && btnUrl.includes('app-config')) {
    const configKey = btnUrl.split(':')[1];
    btnUrl = config.getOptionalString(configKey)
    if (!btnUrl)
      btnUrl = data.button?.fallbackUrl;
  }

  const btnProps: ButtonProps = {
    variant: 'contained',
    color: 'primary',
    className: `${classes.ml25}`,
    ...data.showButton && !data.button?.isExternalUrl
      ? {
        onClick: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
          e.stopPropagation();
          navigate(btnUrl ?? '')
        }
      }
      : {
        target: '_blank',
        href: btnUrl ?? ''
      }
  }

  return (
    <Accordion defaultExpanded={expanded}>
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        IconButtonProps={{ size: 'small' }}
        aria-controls={`panel${data.name}-content`}
        id={`panel${data.name}-header`}
        className={`${classes.ml25} ${classes.fw_700}`}
      >
        {`${index}. ${data?.name?.toLocaleUpperCase()}`}
      </AccordionSummary>
      <AccordionDetails>
        <section>
          {data.description && (
            <Typography component="div"
              className={`${classes.fontSize14} ${classes.ml25} ${classes.description}`}
            >
              {data?.description}
            </Typography>
          )}
          <div>
            {data.items && <ul className={classes.link}>
              {(data.items || []).map((item, idx) => (
                <li key={idx} className={classes.t_align_c}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={classes.a_link}
                  >
                    <div className={classes.icon_style}>
                      <div className={classes.icon_align}>
                        {item.icon}
                      </div>
                    </div>
                    <Typography className={classes.link_label}>
                      {item?.label}
                    </Typography>
                  </a>
                </li>
              ))}
            </ul>}
            <div className={classes.flex}>
              {data.showButton && (
                <Button {...btnProps}>
                  {data.button?.text}
                  {data.button?.isExternalUrl && <OpenInNew style={{marginLeft: '5px'}} fontSize='small' />}
                </Button>
              )}
              {data.showDocsLink && (
                <Button color='primary' href={data.docs?.url ?? ''} className={classes.ml25} target='_blank'>
                  {data.docs?.text}
                  <OpenInNew style={{marginLeft: '5px'}} fontSize='small' />
                </Button>
              )}
            </div>
          </div>
        </section>
      </AccordionDetails>
    </Accordion>
  );
};

export const QuickAccessCard = () => {
  const config = useApi(configApiRef);
  return (
    <Grid item>
      <QuickAccessAccordion config={config} data={allData.learn} index={1} expanded />
      <QuickAccessAccordion config={config} data={allData.discoverContent} index={2}  />
      <QuickAccessAccordion config={config} data={allData.create} index={3} />
      <QuickAccessAccordion config={config} data={allData.develop} index={4}  />
      <QuickAccessAccordion config={config} data={allData.operate} index={5}  />
      <QuickAccessAccordion config={config} data={allData.developmentTools} index={6}  />
    </Grid>
  );
};
