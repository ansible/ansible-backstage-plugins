/*
 * Copyright Red Hat
 *
 * ADR-010: Git Repositories page header action — contributed by APME guest plugin only.
 */

import { Button } from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import { Link as RouterLink } from 'react-router-dom';
import { configApiRef, useApi } from '@backstage/core-plugin-api';

/** Self-service CreateTask path (requires AAP OAuth on submit). */
export const APME_REGISTER_GIT_REPOSITORY_SELF_SERVICE_PATH =
  '/self-service/create/templates/default/apme-register-git-repository';

/**
 * Stock scaffolder path (no AAP OAuth). Used when
 * `ansible.apme.useStockCreateForRegister` is true (e.g. RHDH Local).
 */
export const APME_REGISTER_GIT_REPOSITORY_STOCK_CREATE_PATH =
  '/create/templates/default/apme-register-git-repository';

/** Default Add repository path (Self-service Create). */
export const APME_REGISTER_GIT_REPOSITORY_TEMPLATE_PATH =
  APME_REGISTER_GIT_REPOSITORY_SELF_SERVICE_PATH;

export function resolveApmeRegisterGitRepositoryPath(
  useStockCreate: boolean,
): string {
  return useStockCreate
    ? APME_REGISTER_GIT_REPOSITORY_STOCK_CREATE_PATH
    : APME_REGISTER_GIT_REPOSITORY_SELF_SERVICE_PATH;
}

export const ApmeAddRepositoryHeaderAction = () => {
  const configApi = useApi(configApiRef);
  const useStockCreate =
    configApi.getOptionalBoolean('ansible.apme.useStockCreateForRegister') ??
    false;
  const to = resolveApmeRegisterGitRepositoryPath(useStockCreate);

  return (
    <Button
      variant="contained"
      color="primary"
      startIcon={<AddIcon />}
      component={RouterLink}
      to={to}
    >
      Add repository
    </Button>
  );
};
