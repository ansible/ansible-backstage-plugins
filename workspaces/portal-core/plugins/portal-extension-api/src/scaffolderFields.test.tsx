import { renderHook, act } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { configApiRef } from '@backstage/core-plugin-api';
import { ConfigReader } from '@backstage/config';
import { contributionRegistry } from './registry';
import {
  registerScaffolderField,
  mergeScaffolderFields,
  useScaffolderFields,
} from './scaffolderFields';

describe('scaffolder field discovery', () => {
  const field = { name: 'ThirdPartyField', component: () => null };
  const contribution = {
    id: 'third-party.field',
    pluginId: 'third-party',
    field,
  };
  afterEach(() => contributionRegistry.reset());
  it('keeps host fields on name collisions', () => {
    const host = { ...field, component: () => <div /> };
    expect(mergeScaffolderFields([host], [field])).toEqual([host]);
  });
  it('includes fields when their enablement setting is true', () => {
    registerScaffolderField({
      ...contribution,
      enabledByConfig: 'plugins.thirdParty.enabled',
    });
    const config = new ConfigReader({
      plugins: { thirdParty: { enabled: true } },
    });
    const { result } = renderHook(() => useScaffolderFields(), {
      wrapper: ({ children }) => (
        <TestApiProvider apis={[[configApiRef, config]]}>
          {children}
        </TestApiProvider>
      ),
    });
    expect(result.current).toEqual([field]);
  });
  it('discovers a late third-party registration and unregisters it', () => {
    const config = new ConfigReader({});
    const { result } = renderHook(() => useScaffolderFields(), {
      wrapper: ({ children }) => (
        <TestApiProvider apis={[[configApiRef, config]]}>
          {children}
        </TestApiProvider>
      ),
    });
    expect(result.current).toEqual([]);
    let unregister: () => void;
    act(() => {
      unregister = registerScaffolderField(contribution);
    });
    expect(result.current).toEqual([field]);
    act(() => contributionRegistry.disable(contribution.id));
    expect(result.current).toEqual([]);
    act(() => contributionRegistry.enable(contribution.id));
    expect(result.current).toEqual([field]);
    act(() => unregister());
    expect(result.current).toEqual([]);
  });
  it.each([false, undefined])(
    'omits optional fields when enabled is %s',
    enabled => {
      registerScaffolderField({
        ...contribution,
        enabledByConfig: 'plugins.thirdParty.enabled',
      });
      const config = new ConfigReader({
        plugins: {
          thirdParty: { ...(enabled === undefined ? {} : { enabled }) },
        },
      });
      const { result } = renderHook(() => useScaffolderFields(), {
        wrapper: ({ children }) => (
          <TestApiProvider apis={[[configApiRef, config]]}>
            {children}
          </TestApiProvider>
        ),
      });
      expect(result.current).toEqual([]);
    },
  );
});
