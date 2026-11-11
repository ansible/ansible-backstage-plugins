import { dynamicPluginInstaller } from './index';
import featureLoader from '..';

describe('dynamicPluginInstaller', () => {
  it('has kind "new"', () => {
    expect(dynamicPluginInstaller.kind).toBe('new');
  });

  it('install() returns the default feature loader', () => {
    const result = dynamicPluginInstaller.install();
    expect(result).toBe(featureLoader);
  });
});
