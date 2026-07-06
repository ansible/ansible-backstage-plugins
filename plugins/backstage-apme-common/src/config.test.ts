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

import { getApmeConfig, isApmeEnabled, isApmeAiEnabled } from './config';

function mockApmeSection(
  overrides: {
    getOptionalBoolean?: jest.Mock;
    getString?: jest.Mock;
    getOptionalString?: jest.Mock;
  } = {},
) {
  return {
    getOptionalBoolean: jest.fn().mockReturnValue(undefined),
    getString: jest.fn().mockReturnValue('http://localhost:8080'),
    getOptionalString: jest.fn().mockReturnValue(undefined),
    ...overrides,
  };
}

describe('getApmeConfig', () => {
  it('returns disabled defaults when no apme config exists', () => {
    const mockConfig = {
      getOptionalConfig: jest.fn().mockReturnValue(undefined),
    };

    expect(getApmeConfig(mockConfig as any)).toEqual({
      enabled: false,
      baseUrl: 'http://localhost:8080',
      checkSSL: false,
      enableAi: false,
      publishViaGateway: false,
      targetAnsibleCoreVersion: '2.16',
    });
  });

  it('returns config from ansible.apme section with trailing slash trimmed', () => {
    const mockApmeConfig = mockApmeSection({
      getOptionalBoolean: jest
        .fn()
        .mockImplementation((key: string) =>
          key === 'enabled' ? true : false,
        ),
      getString: jest.fn().mockReturnValue('https://apme.example.com/'),
    });

    const mockConfig = {
      getOptionalConfig: jest
        .fn()
        .mockImplementation((key: string) =>
          key === 'ansible.apme' ? mockApmeConfig : undefined,
        ),
    };

    expect(getApmeConfig(mockConfig as any)).toEqual({
      enabled: true,
      baseUrl: 'https://apme.example.com',
      checkSSL: false,
      enableAi: false,
      publishViaGateway: false,
      targetAnsibleCoreVersion: '2.16',
    });
  });

  it('defaults checkSSL to true when not specified', () => {
    const mockApmeConfig = mockApmeSection({
      getString: jest.fn().mockReturnValue('https://apme.example.com'),
    });

    const mockConfig = {
      getOptionalConfig: jest
        .fn()
        .mockImplementation((key: string) =>
          key === 'ansible.apme' ? mockApmeConfig : undefined,
        ),
    };

    expect(getApmeConfig(mockConfig as any).checkSSL).toBe(true);
  });

  it('defaults enableAi to false when key is omitted', () => {
    const mockApmeConfig = mockApmeSection({
      getOptionalBoolean: jest
        .fn()
        .mockImplementation((key: string) =>
          key === 'enabled' ? true : undefined,
        ),
    });

    const mockConfig = {
      getOptionalConfig: jest
        .fn()
        .mockImplementation((key: string) =>
          key === 'ansible.apme' ? mockApmeConfig : undefined,
        ),
    };

    expect(getApmeConfig(mockConfig as any).enableAi).toBe(false);
    expect(isApmeAiEnabled(mockConfig as any)).toBe(false);
  });
});

describe('isApmeEnabled', () => {
  it('returns true only when enabled flag is set', () => {
    const mockApmeConfig = mockApmeSection({
      getOptionalBoolean: jest
        .fn()
        .mockImplementation((key: string) => key === 'enabled'),
    });

    const mockConfig = {
      getOptionalConfig: jest
        .fn()
        .mockImplementation((key: string) =>
          key === 'ansible.apme' ? mockApmeConfig : undefined,
        ),
    };

    expect(isApmeEnabled(mockConfig as any)).toBe(true);
  });
});
