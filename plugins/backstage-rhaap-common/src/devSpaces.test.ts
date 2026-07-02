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

import {
  buildDevSpacesUrlFromRepoUrl,
  generateDevSpacesUrl,
  parseScmRepoUrl,
} from './devSpaces';

describe('devSpaces', () => {
  it('generateDevSpacesUrl matches scaffolder pattern', () => {
    expect(
      generateDevSpacesUrl(
        'https://devspaces.example.com/',
        'github.com',
        'acme-scm',
        'amazon.aws',
      ),
    ).toBe(
      'https://devspaces.example.com/#https://github.com/acme-scm/amazon.aws',
    );
  });

  it('parseScmRepoUrl extracts host owner and repo', () => {
    expect(parseScmRepoUrl('https://github.com/acme-scm/amazon.aws')).toEqual({
      sourceControl: 'github.com',
      repoOwner: 'acme-scm',
      repoName: 'amazon.aws',
    });
  });

  it('buildDevSpacesUrlFromRepoUrl builds factory URL', () => {
    expect(
      buildDevSpacesUrlFromRepoUrl(
        'https://devspaces.example.com',
        'url:https://github.com/acme-scm/network-firewall.git',
      ),
    ).toBe(
      'https://devspaces.example.com#https://github.com/acme-scm/network-firewall',
    );
  });

  it('buildDevSpacesUrlFromRepoUrl builds factory URL with branch', () => {
    expect(
      buildDevSpacesUrlFromRepoUrl(
        'https://devspaces.example.com',
        'https://github.com/acme-scm/network-firewall.git',
        'apme/remediate-abc',
      ),
    ).toBe(
      'https://devspaces.example.com#https://github.com/acme-scm/network-firewall/tree/apme/remediate-abc',
    );
  });
});
