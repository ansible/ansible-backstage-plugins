/*
 * Copyright Red Hat
 *
 * ADR-010: Git Repositories page header action — contributed by APME guest plugin only.
 */

import { Button } from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import { Link as RouterLink } from 'react-router-dom';

export const APME_REGISTER_GIT_REPOSITORY_TEMPLATE_PATH =
  '/self-service/create/templates/default/apme-register-git-repository';

export const ApmeAddRepositoryHeaderAction = () => (
  <Button
    variant="contained"
    color="primary"
    startIcon={<AddIcon />}
    component={RouterLink}
    to={APME_REGISTER_GIT_REPOSITORY_TEMPLATE_PATH}
  >
    Add repository
  </Button>
);
