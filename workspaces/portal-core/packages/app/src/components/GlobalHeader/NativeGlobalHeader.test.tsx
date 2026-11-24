import { render } from '@testing-library/react';
import { useNativeAppProfileMenuItems } from '@ansible/portal-extension-host/alpha';
import { GlobalHeader } from './GlobalHeader';
import { NativeGlobalHeader } from './NativeGlobalHeader';

jest.mock('@ansible/portal-extension-host/alpha', () => ({
  useNativeAppProfileMenuItems: jest.fn(),
}));
jest.mock('@backstage/core-compat-api', () => ({
  compatWrapper: (element: JSX.Element) => element,
}));
jest.mock('./GlobalHeader', () => ({
  GlobalHeader: jest.fn(() => <div>Global header</div>),
}));

it('passes profile items to the header without Create actions', () => {
  const items = [
    {
      id: 'logout',
      title: 'Sign out',
      type: 'action' as const,
      activate: jest.fn(),
    },
  ];
  jest.mocked(useNativeAppProfileMenuItems).mockReturnValue(items);
  render(<NativeGlobalHeader />);
  expect(GlobalHeader).toHaveBeenCalledWith(
    { profileItems: items },
    expect.anything(),
  );
});
