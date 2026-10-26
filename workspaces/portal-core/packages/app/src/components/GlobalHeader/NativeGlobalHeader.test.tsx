import { render } from '@testing-library/react';
import { GlobalHeader } from './GlobalHeader';
import { NativeGlobalHeader } from './NativeGlobalHeader';

jest.mock('@backstage/core-compat-api', () => ({
  compatWrapper: (element: JSX.Element) => element,
}));
jest.mock('./GlobalHeader', () => ({
  GlobalHeader: jest.fn(() => <div>Global header</div>),
}));

it('renders the native header without a Create destination or page-discovery API', () => {
  render(<NativeGlobalHeader />);
  expect(GlobalHeader).toHaveBeenCalledWith({}, expect.anything());
});
