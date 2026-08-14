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

import { fireEvent, render, screen } from '@testing-library/react';
import { RemediationReviewWorkspace } from './RemediationReviewWorkspace';

const files = [
  {
    file: 'action.yml',
    before: 'old: true',
    after: 'old: false',
  },
  {
    file: 'tests/site.yml',
    before: 'hosts: all',
    after: 'hosts: localhost',
  },
];

describe('RemediationReviewWorkspace', () => {
  it('lists changed files and shows a read-only diff', () => {
    render(
      <RemediationReviewWorkspace
        files={files}
        selectedFile="action.yml"
        onSelectedFileChange={jest.fn()}
      />,
    );

    expect(screen.getByText(/Prepared patches · 2 files/)).toBeTruthy();
    expect(screen.queryByLabelText('Edit file content')).toBeNull();
    expect(screen.getByText('Changes')).toBeTruthy();
    expect(
      screen.getByText(/Push applies this patch. Edit in Dev Spaces after push/),
    ).toBeTruthy();
  });

  it('requests file selection from the list', () => {
    const onSelectedFileChange = jest.fn();
    render(
      <RemediationReviewWorkspace
        files={files}
        selectedFile="action.yml"
        onSelectedFileChange={onSelectedFileChange}
      />,
    );

    fireEvent.click(screen.getByText('tests/site.yml'));
    expect(onSelectedFileChange).toHaveBeenCalledWith('tests/site.yml');
  });

  it('shows diff for patch-only files', () => {
    render(
      <RemediationReviewWorkspace
        files={[
          {
            file: 'Chart.yaml',
            diff: '--- a/Chart.yaml\n+++ b/Chart.yaml\n@@ -1 +1 @@\n-version: 0.1.0\n+version: 0.1.1',
          },
        ]}
        selectedFile="Chart.yaml"
        onSelectedFileChange={jest.fn()}
      />,
    );

    expect(screen.getByText('Changes')).toBeTruthy();
    expect(screen.queryByLabelText('Edit file content')).toBeNull();
    expect(
      screen.getByText(/Push applies this patch. Edit in Dev Spaces after push/),
    ).toBeTruthy();
  });
});
