/*
 * Copyright Red Hat
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ApmePortalSettingsStore } from './apmePortalSettingsStore';

describe('ApmePortalSettingsStore', () => {
  let settingsPath: string;

  beforeEach(() => {
    settingsPath = path.join(
      os.tmpdir(),
      `apme-portal-settings-${Date.now()}-${Math.random()}.json`,
    );
  });

  afterEach(async () => {
    await fs.rm(settingsPath, { force: true });
  });

  it('returns empty settings when file is missing', async () => {
    const store = new ApmePortalSettingsStore(settingsPath);
    await expect(store.read()).resolves.toEqual({});
  });

  it('returns empty settings when file is empty', async () => {
    await fs.writeFile(settingsPath, '');
    const store = new ApmePortalSettingsStore(settingsPath);
    await expect(store.read()).resolves.toEqual({});
  });

  it('returns empty settings when file has invalid JSON', async () => {
    await fs.writeFile(settingsPath, '{');
    const store = new ApmePortalSettingsStore(settingsPath);
    await expect(store.read()).resolves.toEqual({});
  });

  it('round-trips written settings', async () => {
    const store = new ApmePortalSettingsStore(settingsPath);
    await store.updateGlobal('2.16');
    await expect(store.read()).resolves.toEqual({
      global: { targetAnsibleCoreVersion: '2.16' },
    });
  });
});
