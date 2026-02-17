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

import { stringifyEntityRef } from '@backstage/catalog-model';

/**
 * AAP OAuth token data stored in session
 * @public
 */
export interface AAPTokenData {
  accessToken: string;
  storedAt: string;
  expiresAt?: string;
  userEntityRef?: string;
}

/**
 * Session structure with AAP token
 * @public
 */
export interface AAPSession {
  aapToken?: AAPTokenData;
}

/**
 * Express Request with AAP session
 * @public
 */
export interface RequestWithAAPSession {
  session?: AAPSession & {
    save?: (callback?: (err?: Error) => void) => void;
  };
}

/**
 * Store AAP OAuth token in the session
 * 
 * @param req - Express request with session
 * @param accessToken - AAP OAuth access token
 * @param options - Storage options including username and expiry
 * @returns true if stored successfully, false otherwise
 * @public
 */
export function storeAAPToken(
  req: RequestWithAAPSession,
  accessToken: string,
  options: {
    username: string;
    expiresAt?: string;
  },
): boolean {
  if (!req.session) {
    return false;
  }

  // Construct user entity ref from username
  const userEntityRef = stringifyEntityRef({
    kind: 'User',
    namespace: 'default',
    name: options.username,
  });

  req.session.aapToken = {
    accessToken,
    storedAt: new Date().toISOString(),
    expiresAt: options.expiresAt,
    userEntityRef,
  };

  return true;
}

/**
 * Retrieve AAP OAuth token from the session
 * @public
 */
export function getAAPToken(
  req: RequestWithAAPSession,
): AAPTokenData | null {
  return req.session?.aapToken || null;
}

/**
 * Remove AAP OAuth token from the session
 * @public
 */
export function removeAAPToken(req: RequestWithAAPSession): boolean {
  if (!req.session?.aapToken) {
    return false;
  }
  delete req.session.aapToken;
  return true;
}

/**
 * GitHub token data stored in session
 * @public
 */
export interface GitHubTokenData {
  accessToken: string;
  storedAt: string;
  expiresAt?: string;
  userEntityRef?: string;
}

/**
 * Session structure with GitHub token
 * @public
 */
export interface GitHubSession {
  githubToken?: GitHubTokenData;
}

/**
 * Express Request with GitHub session
 * @public
 */
export interface RequestWithGitHubSession {
  session?: GitHubSession & {
    save?: (callback?: (err?: Error) => void) => void;
  };
}

/**
 * Store GitHub OAuth token in the session
 * @public
 */
export function storeGitHubToken(
  req: RequestWithGitHubSession,
  accessToken: string,
  options: {
    username: string;
    expiresAt?: string;
  },
): boolean {
  if (!req.session) {
    return false;
  }

  const userEntityRef = stringifyEntityRef({
    kind: 'User',
    namespace: 'default',
    name: options.username,
  });

  req.session.githubToken = {
    accessToken,
    storedAt: new Date().toISOString(),
    expiresAt: options.expiresAt,
    userEntityRef,
  };

  return true;
}

/**
 * Retrieve GitHub OAuth token from the session
 * @public
 */
export function getGitHubToken(
  req: RequestWithGitHubSession,
): GitHubTokenData | null {
  return req.session?.githubToken || null;
}

/**
 * Remove GitHub OAuth token from the session
 * @public
 */
export function removeGitHubToken(req: RequestWithGitHubSession): boolean {
  if (!req.session?.githubToken) {
    return false;
  }
  delete req.session.githubToken;
  return true;
}
