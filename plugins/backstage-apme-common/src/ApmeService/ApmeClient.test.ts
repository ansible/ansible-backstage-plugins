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

import { getApmeConfig } from './ApmeClient';

describe('getApmeConfig', () => {
  it('should return default config when no apme config exists', () => {
    const mockConfig = {
      getOptionalConfig: jest.fn().mockReturnValue(undefined),
    };

    const result = getApmeConfig(mockConfig as any);

    expect(result).toEqual({
      baseUrl: 'http://localhost:8080',
      checkSSL: true,
    });
  });

  it('should return config from ansible.apme section', () => {
    const mockApmeConfig = {
      getString: jest.fn().mockReturnValue('https://apme.example.com'),
      getOptionalBoolean: jest.fn().mockReturnValue(false),
    };

    const mockConfig = {
      getOptionalConfig: jest.fn().mockReturnValue(mockApmeConfig),
    };

    const result = getApmeConfig(mockConfig as any);

    expect(result).toEqual({
      baseUrl: 'https://apme.example.com',
      checkSSL: false,
    });
  });

  it('should default checkSSL to true when not specified', () => {
    const mockApmeConfig = {
      getString: jest.fn().mockReturnValue('https://apme.example.com'),
      getOptionalBoolean: jest.fn().mockReturnValue(undefined),
    };

    const mockConfig = {
      getOptionalConfig: jest.fn().mockReturnValue(mockApmeConfig),
    };

    const result = getApmeConfig(mockConfig as any);

    expect(result.checkSSL).toBe(true);
  });
});
