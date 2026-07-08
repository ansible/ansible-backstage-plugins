import { dynamicPluginInstaller } from './index';
import catalogModuleApme from '..';

describe('dynamicPluginInstaller', () => {
  it('has kind "new"', () => {
    expect(dynamicPluginInstaller.kind).toBe('new');
  });

  it('install() returns the catalogModuleApme', () => {
    const result = dynamicPluginInstaller.install();
    expect(result).toBe(catalogModuleApme);
  });
});
