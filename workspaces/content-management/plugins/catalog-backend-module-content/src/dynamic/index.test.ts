import featureLoader from '..';
import { dynamicPluginInstaller } from './index';

it('installs the catalog content feature loader', () => {
  expect(dynamicPluginInstaller.kind).toBe('new');
  expect(dynamicPluginInstaller.install()).toBe(featureLoader);
});
