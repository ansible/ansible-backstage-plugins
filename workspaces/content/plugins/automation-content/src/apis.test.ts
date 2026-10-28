import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { AutomationContentClient, automationContentApiRef } from './api';
import { automationContentApiFactory } from './apis';

it('wires discovery and authenticated fetch to the content client', async () => {
  const discoveryApi = { getBaseUrl: jest.fn().mockResolvedValue('/backend') };
  const fetchApi = {
    fetch: jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    }),
  };
  expect(automationContentApiFactory.api).toBe(automationContentApiRef);
  expect(automationContentApiFactory.deps).toEqual({
    discoveryApi: discoveryApiRef,
    fetchApi: fetchApiRef,
  });
  const client = automationContentApiFactory.factory({
    discoveryApi,
    fetchApi,
  });
  expect(client).toBeInstanceOf(AutomationContentClient);
  await expect(client.listRegistries()).resolves.toEqual([]);
  expect(discoveryApi.getBaseUrl).toHaveBeenCalledWith('automation-content');
  expect(fetchApi.fetch).toHaveBeenCalledWith('/backend/registries');
});
