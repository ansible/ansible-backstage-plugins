import { render } from '@testing-library/react';
import { useNativeAppHeaderActions } from '@ansible/portal-extension-host/alpha';
import { GlobalHeader } from './GlobalHeader';
import { NativeGlobalHeader } from './NativeGlobalHeader';

jest.mock('@ansible/portal-extension-host/alpha', () => ({
  useNativeAppHeaderActions: jest.fn(),
}));
jest.mock('@backstage/core-compat-api', () => ({
  compatWrapper: (element: JSX.Element) => element,
}));
jest.mock('./GlobalHeader', () => ({
  GlobalHeader: jest.fn(() => <div>Global header</div>),
}));

it.each([
  { actions: [] },
  {
    actions: [
      { id: 'independent.create', title: 'New content', path: '/independent' },
    ],
  },
])(
  'passes eligible generic Create actions to the header: %j',
  ({ actions }) => {
    jest.mocked(useNativeAppHeaderActions).mockReturnValue(actions);
    render(<NativeGlobalHeader />);
    expect(useNativeAppHeaderActions).toHaveBeenCalledWith('create');
    expect(GlobalHeader).toHaveBeenLastCalledWith(
      { createActions: actions },
      expect.anything(),
    );
  },
);
