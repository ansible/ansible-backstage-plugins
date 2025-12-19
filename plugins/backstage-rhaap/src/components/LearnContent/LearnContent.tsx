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
import { InfoCard, ItemCardGrid, Link } from '@backstage/core-components';
import { Grid, Typography, makeStyles } from '@material-ui/core';
import OpenInNew from '@material-ui/icons/OpenInNew';
import { ILearningPath, learningPaths } from './data';
import {
  SearchBar,
  SearchContextProvider,
  SearchFilter,
  useSearch,
} from '@backstage/plugin-search-react';

const useStyles = makeStyles(theme => ({
  container: {
    // backgroundColor: 'default',
    padding: '20px',
  },
  flex: {
    display: 'flex',
  },
  img_wave: {
    width: '50px',
    height: '50px',
    margin: '5px',
  },
  fw_700: {
    fontWeight: 700,
  },
  ml25: {
    marginLeft: '25px',
  },
  mb40: {
    marginBottom: '40px',
  },
  fontSize14: {
    fontSize: '14px',
  },
  open_in_new: {
    width: 12,
    height: 12,
    fill: '#0066CC',
  },
  infoCard: {
    display: 'flex',
    height: '100%',
    transition: 'all 0.25s linear',
    textAlign: 'left',
    '&:hover': {
      boxShadow: '0px 0px 8px 0px rgba(0, 0, 0, 0.8)',
    },
  },
  subtitle: {
    color:
      theme.palette.type === 'light' ? 'rgba(0, 0, 0, 0.40)' : 'currentColor',
  },
  textDecorationNone: {
    '&:hover': {
      textDecoration: 'none',
    },
  },
  label: {
    textTransform: 'capitalize',
  },
  checkboxWrapper: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
  },
  textWrapper: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
}));

const RenderCourses = ({ data }: { data: ILearningPath[] }) => {
  const classes = useStyles();

  const getFormat = (item: ILearningPath) => {
    if (item.minutes) return item.minutes === 1 ? 'minute' : 'minutes';
    if (item.hours) return item.hours === 1 ? 'hour' : 'hours';
    /* istanbul ignore next */
    return null;
  };

  return data.map((item: ILearningPath, index: number) => (
    <Link
      to={item?.url}
      target="_blank"
      key={index}
      className={classes.textDecorationNone}
    >
      <InfoCard
        className={classes.infoCard}
        title={
          <div style={{ display: 'flex' }}>
            <div>{`${index + 1}.`}</div>
            {item.label}
          </div>
        }
        subheader={
          <Typography className={`${classes.subtitle} ${classes.fontSize14}`}>
            {`${item.minutes || item.hours} ${getFormat(item)}  | Ansible | ${item.level} | ${item.type}`}
          </Typography>
        }
      >
        {item.description}
      </InfoCard>
    </Link>
  ));
};

const EntityLearnIntroCard = () => {
  const classes = useStyles();

  const { filters, term } = useSearch();
  const [filteredData, setFilteredData] = useState({
    learningPaths: learningPaths,
  });

  useEffect(() => {
    if (term.length > 1) {
      setFilteredData({
        learningPaths: learningPaths.filter(
          item =>
            item.label?.toLocaleLowerCase().includes(term) ||
            item.description?.toLocaleLowerCase().includes(term),
        ),
      });
    } else setFilteredData({ learningPaths: learningPaths });
  }, [term]);

  return (
    <>
      <Grid container spacing={3} data-testid="learn-content">
        <Grid item xs={2}>
          <SearchBar
            debounceTime={100}
            className="MuiInput-underline"
            clearButton={false}
            placeholder="Search"
          />
          <SearchFilter.Checkbox
            name="types"
            values={['Learning Paths']}
            defaultValue={['Learning Paths']}
          />

          <Typography style={{ marginTop: '32px' }} component="div">
            Useful links:
            <br />
            <Typography
              style={{ marginTop: '16px', fontSize: '14px' }}
              component="div"
            >
              <Link to="https://red.ht/aap-rhd-learning-paths">
                Ansible learning paths on <br /> Red Hat Developer website
                <OpenInNew
                  fontSize="small"
                  style={{ marginLeft: '5px', fontSize: '14px' }}
                />
              </Link>
            </Typography>
            <Typography
              style={{ marginTop: '16px', fontSize: '14px' }}
              component="div"
            >
              <Link to="https://red.ht/rhdh-rh-learning-subscription">
                Red Hat Learning Subscription
                <OpenInNew
                  fontSize="small"
                  style={{ marginLeft: '5px', fontSize: '14px' }}
                />
              </Link>
            </Typography>
            <Typography
              style={{ marginTop: '16px', fontSize: '14px' }}
              component="div"
            >
              <Link to="https://docs.ansible.com/ansible/latest/reference_appendices/glossary.html">
                Ansible definitions
                <OpenInNew
                  fontSize="small"
                  style={{ marginLeft: '5px', fontSize: '14px' }}
                />
              </Link>
            </Typography>
            <Typography
              style={{ marginTop: '16px', fontSize: '14px' }}
              component="div"
            >
              <Link to="http://red.ht/aap-lp-getting-started-rhaap-plugin">
                User Guide
                <OpenInNew
                  fontSize="small"
                  style={{ marginLeft: '5px', fontSize: '14px' }}
                />
              </Link>
            </Typography>
          </Typography>
        </Grid>
        <Grid item xs={10}>
          {Array.isArray(filters?.types) &&
            filters?.types?.includes('Learning Paths') &&
            filteredData.learningPaths.length > 0 && (
              <div
                style={{ marginBottom: '35px' }}
                data-testid="learning-paths"
              >
                <Typography paragraph>
                  <Typography component="span">
                    LEARNING PATHS <br />{' '}
                  </Typography>
                  <Typography component="span" className={classes.fontSize14}>
                    Step-by-step enablement curated by Red Hat Ansible.
                  </Typography>
                </Typography>
                <ItemCardGrid>
                  <RenderCourses data={filteredData.learningPaths} />
                </ItemCardGrid>
              </div>
            )}
        </Grid>
      </Grid>
    </>
  );
};

export const EntityLearnContent = () => {
  return (
    <SearchContextProvider>
      <EntityLearnIntroCard />;
    </SearchContextProvider>
  );
};
