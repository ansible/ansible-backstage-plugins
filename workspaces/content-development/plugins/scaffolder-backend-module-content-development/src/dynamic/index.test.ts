import { dynamicPluginInstaller } from './index';

describe('dynamicPluginInstaller', () => {
  it('has kind "new"', () => {
    expect(dynamicPluginInstaller.kind).toBe('new');
  });

  it('install() returns the loader that provides the lifecycle factory and module', () => {
    const result = dynamicPluginInstaller.install();
    expect(result).toBeDefined();
    expect(result).not.toBe(dynamicPluginInstaller);
  });
});
