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
import { RemediationReviewDialog } from './RemediationReviewDialog';

const files = [
  {
    file: 'action.yml',
    before: 'old: true',
    after: 'old: false',
  },
];

describe('RemediationReviewDialog', () => {
  it('shows file and finding counts and closes', () => {
    const onClose = jest.fn();
    render(
      <RemediationReviewDialog
        open
        onClose={onClose}
        fileCount={3}
        findingCount={12}
        files={files}
        selectedFile="action.yml"
        onSelectedFileChange={jest.fn()}
      />,
    );

    expect(screen.getByText('View prepared patches')).toBeTruthy();
    expect(screen.getByText(/3 files · 12 findings · read-only/)).toBeTruthy();
    expect(screen.queryByLabelText('Edit file content')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
