/*
 * Copyright Red Hat
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

import { useState } from 'react';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import {
  Table,
  TableColumn,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import {
  Chip,
  makeStyles,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
} from '@material-ui/core';
import { Violation } from '@ansible/backstage-apme-common';
import { apmeApiRef } from '../../api';

const useStyles = makeStyles(theme => ({
  filterContainer: {
    display: 'flex',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  formControl: {
    minWidth: 150,
  },
  blocker: {
    backgroundColor: '#7b1fa2',
    color: theme.palette.common.white,
  },
  critical: {
    backgroundColor: theme.palette.error.dark,
    color: theme.palette.error.contrastText,
  },
  high: {
    backgroundColor: theme.palette.error.main,
    color: theme.palette.error.contrastText,
  },
  medium: {
    backgroundColor: theme.palette.warning.main,
    color: theme.palette.warning.contrastText,
  },
  low: {
    backgroundColor: theme.palette.info.main,
    color: theme.palette.info.contrastText,
  },
  info: {
    backgroundColor: theme.palette.grey[500],
    color: theme.palette.common.white,
  },
  auto: {
    backgroundColor: '#4caf50',
    color: theme.palette.common.white,
  },
  assisted: {
    backgroundColor: '#2196f3',
    color: theme.palette.common.white,
  },
  manual: {
    backgroundColor: '#ff9800',
    color: theme.palette.common.white,
  },
  none: {
    backgroundColor: theme.palette.grey[400],
    color: theme.palette.common.white,
  },
  noData: {
    padding: theme.spacing(4),
    textAlign: 'center',
  },
}));

const levelOrder: Record<string, number> = {
  blocker: 0,
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
  info: 5,
};

const remediationLabels: Record<number, string> = {
  1: 'auto',
  2: 'assisted',
  3: 'manual',
  9: 'none',
};

export const ApmeViolationsTable = () => {
  const classes = useStyles();
  const apmeApi = useApi(apmeApiRef);
  const { entity } = useEntity();
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [validatorFilter, setValidatorFilter] = useState<string>('all');

  const repoUrl =
    entity.metadata.annotations?.['backstage.io/source-location'] ||
    entity.metadata.annotations?.['github.com/project-slug'];

  const { value, loading, error } = useAsync(async () => {
    if (!repoUrl) return { project: null, violations: [] };
    const project = await apmeApi.getProjectByRepoUrl(repoUrl);
    if (!project) return { project: null, violations: [] };
    const violations = await apmeApi.getViolations(project.id);
    return { project, violations };
  }, [repoUrl]);

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  const { violations = [] } = value || {};

  if (violations.length === 0) {
    return (
      <div className={classes.noData}>
        <Typography variant="body1" color="textSecondary">
          No violations found. Run a scan to analyze the repository.
        </Typography>
      </div>
    );
  }

  const validators = [...new Set(violations.map(v => v.validator_source))];

  const filteredViolations = violations
    .filter(v => levelFilter === 'all' || v.level === levelFilter)
    .filter(
      v => validatorFilter === 'all' || v.validator_source === validatorFilter,
    )
    .sort((a, b) => (levelOrder[a.level] ?? 99) - (levelOrder[b.level] ?? 99));

  const getLevelClass = (level: string): string => {
    return (classes as Record<string, string>)[level] || classes.info;
  };

  const getRemediationClass = (remClass: number): string => {
    const label = remediationLabels[remClass] || 'none';
    return (classes as Record<string, string>)[label] || classes.none;
  };

  const columns: TableColumn<Violation>[] = [
    {
      title: 'Level',
      field: 'level',
      width: '100px',
      render: row => (
        <Chip
          size="small"
          label={row.level.toUpperCase()}
          className={getLevelClass(row.level)}
        />
      ),
    },
    {
      title: 'Rule',
      field: 'rule_id',
      width: '100px',
    },
    {
      title: 'Message',
      field: 'message',
    },
    {
      title: 'File',
      field: 'file',
      render: row => `${row.file}:${row.line}`,
    },
    {
      title: 'Validator',
      field: 'validator_source',
      width: '100px',
    },
    {
      title: 'Fix',
      field: 'remediation_class',
      width: '90px',
      render: row => (
        <Chip
          size="small"
          label={remediationLabels[row.remediation_class] || 'none'}
          className={getRemediationClass(row.remediation_class)}
        />
      ),
    },
  ];

  return (
    <>
      <Box className={classes.filterContainer}>
        <FormControl
          className={classes.formControl}
          variant="outlined"
          size="small"
        >
          <InputLabel>Level</InputLabel>
          <Select
            value={levelFilter}
            onChange={e => setLevelFilter(e.target.value as string)}
            label="Level"
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="blocker">Blocker</MenuItem>
            <MenuItem value="critical">Critical</MenuItem>
            <MenuItem value="high">High</MenuItem>
            <MenuItem value="medium">Medium</MenuItem>
            <MenuItem value="low">Low</MenuItem>
            <MenuItem value="info">Info</MenuItem>
          </Select>
        </FormControl>
        <FormControl
          className={classes.formControl}
          variant="outlined"
          size="small"
        >
          <InputLabel>Validator</InputLabel>
          <Select
            value={validatorFilter}
            onChange={e => setValidatorFilter(e.target.value as string)}
            label="Validator"
          >
            <MenuItem value="all">All</MenuItem>
            {validators.map(val => (
              <MenuItem key={val} value={val}>
                {val}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      <Table
        title={`Violations (${filteredViolations.length})`}
        options={{
          search: true,
          paging: true,
          pageSize: 10,
          pageSizeOptions: [10, 25, 50],
        }}
        columns={columns}
        data={filteredViolations}
      />
    </>
  );
};
