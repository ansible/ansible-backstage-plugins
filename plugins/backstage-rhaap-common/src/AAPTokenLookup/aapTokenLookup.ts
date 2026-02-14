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

import {
  createServiceRef,
  LoggerService,
  DatabaseService,
} from '@backstage/backend-plugin-api';
import { Knex } from 'knex';

/**
 * Result from AAP token lookup
 * @public
 */
export interface AAPTokenLookupResult {
  accessToken: string;
  userEntityRef?: string;
  expiresAt?: string;
  storedAt?: string;
}

/**
 * Interface for AAP token lookup service
 * @public
 */
export interface IAAPTokenLookup {
  getTokenByUserEntityRef(
    userEntityRef: string,
  ): Promise<AAPTokenLookupResult | null>;
}

/**
 * AAP Token Lookup Service
 * 
 * Queries the session database to retrieve a user's AAP OAuth token by their entity ref.
 * Used by the Permission Policy to access AAP API on behalf of the logged-in user.
 * 
 * @public
 */
export class AAPTokenLookup implements IAAPTokenLookup {
  private readonly knex: Knex;
  private readonly logger: LoggerService;

  constructor(options: { knex: Knex; logger: LoggerService }) {
    this.knex = options.knex;
    this.logger = options.logger;
  }

  static async create(options: {
    database: DatabaseService;
    logger: LoggerService;
  }): Promise<AAPTokenLookup> {
    const knex = await options.database.getClient();
    return new AAPTokenLookup({ knex, logger: options.logger });
  }

  async getTokenByUserEntityRef(
    userEntityRef: string,
  ): Promise<AAPTokenLookupResult | null> {
    try {
      this.logger.info(
        `[AAPTokenLookup] 🔍 Looking up AAP token for user: ${userEntityRef}`,
      );

      // Query all non-expired sessions (database-agnostic approach)
      const results = await this.knex('sessions')
        .select('sess')
        .where('expired', '>', new Date())
        .orderBy('expired', 'desc')
        .limit(100);

      if (!results || results.length === 0) {
        this.logger.warn('[AAPTokenLookup] ⚠️  No active sessions found');
        return null;
      }

      this.logger.info(
        `[AAPTokenLookup] Found ${results.length} active sessions, filtering for user ${userEntityRef}`,
      );

      // Filter sessions by userEntityRef
      for (const result of results) {
        const sessData =
          typeof result.sess === 'string'
            ? JSON.parse(result.sess)
            : result.sess;

        if (sessData?.aapToken?.userEntityRef !== userEntityRef) {
          continue;
        }

        if (!sessData.aapToken.accessToken) {
          continue;
        }

        // Check if token is expired
        if (sessData.aapToken.expiresAt) {
          const expiryTime = new Date(sessData.aapToken.expiresAt).getTime();
          if (Date.now() > expiryTime) {
            this.logger.warn(
              `[AAPTokenLookup] ⏰ Token expired for ${userEntityRef}`,
            );
            continue;
          }
        }

        this.logger.info(
          `[AAPTokenLookup] ✅ Found valid AAP token for ${userEntityRef}`,
        );

        return {
          accessToken: sessData.aapToken.accessToken,
          userEntityRef: sessData.aapToken.userEntityRef,
          expiresAt: sessData.aapToken.expiresAt,
          storedAt: sessData.aapToken.storedAt,
        };
      }

      this.logger.warn(
        `[AAPTokenLookup] ❌ No valid AAP token found for ${userEntityRef}`,
      );
      return null;
    } catch (error) {
      this.logger.error(
        `[AAPTokenLookup] Error looking up token for ${userEntityRef}: ${error}`,
      );
      return null;
    }
  }
}

/**
 * Service reference for AAP token lookup
 * @public
 */
export const aapTokenLookupRef = createServiceRef<IAAPTokenLookup>({
  id: 'ansible.aap-token-lookup',
  scope: 'plugin',
});

