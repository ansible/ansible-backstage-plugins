import { dynamicPluginInstaller } from './index';
import catalogModuleRhaap from '..';

describe('dynamicPluginInstaller', () => {
  it('has kind "new"', () => {
    expect(dynamicPluginInstaller.kind).toBe('new');
  });

  it('install() returns the catalogModuleRhaap', () => {
    const result = dynamicPluginInstaller.install();
    expect(result).toBe(catalogModuleRhaap);
  });
});
