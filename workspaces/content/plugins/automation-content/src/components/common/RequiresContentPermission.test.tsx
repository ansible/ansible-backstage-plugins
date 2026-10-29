import { render, screen } from '@testing-library/react';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { RequiresContentPermission } from './RequiresContentPermission';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApp: () => ({
    getComponents: () => ({ NotFoundErrorPage: () => <div>Not found</div> }),
  }),
}));

it('explains denied access without rendering content or redirecting', async () => {
  render(
    <TestApiProvider
      apis={[[permissionApiRef, mockApis.permission({ authorize: 'DENY' })]]}
    >
      <RequiresContentPermission>
        <div>Protected content</div>
      </RequiresContentPermission>
    </TestApiProvider>,
  );
  expect(await screen.findByText('Access needed')).toBeTruthy();
  expect(
    screen.getByText(
      'You do not have permission to view automation content. Ask your portal administrator for access.',
    ),
  ).toBeTruthy();
  expect(screen.queryByText('Protected content')).toBeNull();
});
