/*
 * Copyright Red Hat
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TestApiProvider } from '@backstage/test-utils';
import { configApiRef } from '@backstage/core-plugin-api';
import {
  ApmeAddRepositoryHeaderAction,
  APME_REGISTER_GIT_REPOSITORY_SELF_SERVICE_PATH,
  APME_REGISTER_GIT_REPOSITORY_STOCK_CREATE_PATH,
  resolveApmeRegisterGitRepositoryPath,
} from './ApmeAddRepositoryHeaderAction';

function renderAction(config: Record<string, boolean> = {}) {
  const configApi = {
    getOptionalBoolean: (key: string) => {
      const value = config[key];
      return typeof value === 'boolean' ? value : undefined;
    },
  };
  return render(
    <TestApiProvider apis={[[configApiRef, configApi]]}>
      <MemoryRouter>
        <ApmeAddRepositoryHeaderAction />
      </MemoryRouter>
    </TestApiProvider>,
  );
}

describe('resolveApmeRegisterGitRepositoryPath', () => {
  it('defaults to Self-service Create', () => {
    expect(resolveApmeRegisterGitRepositoryPath(false)).toBe(
      APME_REGISTER_GIT_REPOSITORY_SELF_SERVICE_PATH,
    );
  });

  it('uses stock Create when requested', () => {
    expect(resolveApmeRegisterGitRepositoryPath(true)).toBe(
      APME_REGISTER_GIT_REPOSITORY_STOCK_CREATE_PATH,
    );
  });
});

describe('ApmeAddRepositoryHeaderAction', () => {
  it('links to Self-service Create by default', () => {
    renderAction();
    // MUI Button + RouterLink exposes role="button" with href.
    expect(
      screen.getByRole('button', { name: /add repository/i }),
    ).toHaveAttribute('href', APME_REGISTER_GIT_REPOSITORY_SELF_SERVICE_PATH);
  });

  it('links to stock Create when useStockCreateForRegister is true', () => {
    renderAction({ 'ansible.apme.useStockCreateForRegister': true });
    expect(
      screen.getByRole('button', { name: /add repository/i }),
    ).toHaveAttribute('href', APME_REGISTER_GIT_REPOSITORY_STOCK_CREATE_PATH);
  });
});
