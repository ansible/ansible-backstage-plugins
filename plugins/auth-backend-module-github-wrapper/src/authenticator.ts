/*
 * Copyright 2025 The Ansible plugin Authors
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

import { githubAuthenticator } from '@backstage/plugin-auth-backend-module-github-provider';
import {
  storeGitHubToken,
  removeGitHubToken,
  RequestWithGitHubSession,
} from '@ansible/backstage-rhaap-common';

/**
 * GitHub Authenticator with Token Storage
 * 
 * Wraps the standard GitHub authenticator to add OAuth token storage
 * in database-backed sessions for permission policy access.
 * 
 * @public
 */
export const githubAuthenticatorWithStorage = {
  ...githubAuthenticator,

  async start(input: any, ctx: any) {
    return githubAuthenticator.start(input, ctx);
  },

  async authenticate(input: any, ctx: any) {
    // Call standard GitHub authenticator
    const result = await githubAuthenticator.authenticate(input, ctx);

    // Store GitHub token in session
    if (result.fullProfile?.username) {
      const expiresAt = result.session.expiresInSeconds
        ? new Date(Date.now() + result.session.expiresInSeconds * 1000).toISOString()
        : undefined;

      storeGitHubToken(
        input.req as RequestWithGitHubSession,
        result.session.accessToken,
        {
          username: result.fullProfile.username,
          expiresAt,
        },
      );
    }

    return result;
  },

  async refresh(input: any, ctx: any) {
    // Call standard GitHub refresh
    const result = await githubAuthenticator.refresh(input, ctx);

    // Update GitHub token in session
    if (result.fullProfile?.username) {
      const expiresAt = result.session.expiresInSeconds
        ? new Date(Date.now() + result.session.expiresInSeconds * 1000).toISOString()
        : undefined;

      storeGitHubToken(
        input.req as RequestWithGitHubSession,
        result.session.accessToken,
        {
          username: result.fullProfile.username,
          expiresAt,
        },
      );
    }

    return result;
  },

  async logout(input: any, ctx: any) {
    // Remove GitHub token from session
    removeGitHubToken(input.req as RequestWithGitHubSession);

    // Call standard logout if exists
    if (githubAuthenticator.logout) {
      return githubAuthenticator.logout(input, ctx);
    }
  },
};

