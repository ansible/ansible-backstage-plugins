import { ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { scmAuthApiRef } from '@backstage/integration-react';
import type { Entity } from '@backstage/catalog-model';
import { NotificationProvider, notificationStore } from '../../notifications';
import {
  EE_BUILD_PENDING_MAX_AGE_MS,
  EE_BUILD_PENDING_SESSION_KEY,
  type EeBuildPendingPayload,
} from './eeBuildSession';
import { useEEBuildFlow } from './useEEBuildFlow';

const mockGetCredentials = jest.fn();
const mockGetEntityByRef = jest.fn();

const mockScmApi = { getCredentials: mockGetCredentials };
const mockCatalogApi = { getEntityByRef: mockGetEntityByRef };

const wrapper = ({ children }: { children: ReactNode }) => (
  <TestApiProvider
    apis={[
      [catalogApiRef, mockCatalogApi],
      [scmAuthApiRef, mockScmApi],
    ]}
  >
    <NotificationProvider>{children}</NotificationProvider>
  </TestApiProvider>
);

const entityWithGithub: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'my-ee',
    namespace: 'default',
    annotations: {
      'backstage.io/source-location':
        'url:https://github.com/acme/repo/tree/main/ee/',
      'ansible.io/scm-provider': 'github',
    },
  },
  spec: { type: 'execution-environment' },
};

const entityNoScm: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'plain',
    annotations: {},
  },
  spec: { type: 'execution-environment' },
};

describe('useEEBuildFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    notificationStore.clearAll();
    mockGetCredentials.mockResolvedValue({ token: 't', headers: {} });
  });

  it('shows notification and skips SCM auth when entity has no Git source', async () => {
    const showSpy = jest.spyOn(notificationStore, 'showNotification');

    const { result } = renderHook(() => useEEBuildFlow(), { wrapper });

    await act(async () => {
      await result.current.startBuildFlow(entityNoScm);
    });

    expect(mockGetCredentials).not.toHaveBeenCalled();
    expect(showSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Cannot start build',
        severity: 'error',
      }),
    );
    expect(result.current.dialogOpen).toBe(false);
    showSpy.mockRestore();
  });

  it('opens dialog and clears sessionStorage after successful getCredentials', async () => {
    const { result } = renderHook(() => useEEBuildFlow(), { wrapper });

    await act(async () => {
      await result.current.startBuildFlow(entityWithGithub);
    });

    expect(mockGetCredentials).toHaveBeenCalledWith({
      url: 'https://github.com/acme/repo',
    });
    expect(sessionStorage.getItem(EE_BUILD_PENDING_SESSION_KEY)).toBeNull();
    expect(result.current.dialogOpen).toBe(true);
    expect(result.current.buildEntity).toEqual(entityWithGithub);
    expect(result.current.scmToken).toBe('t');
    expect(result.current.authBusy).toBe(false);
  });

  it('stores pending key before getCredentials and removes it on failure', async () => {
    mockGetCredentials.mockImplementation(async () => {
      const raw = sessionStorage.getItem(EE_BUILD_PENDING_SESSION_KEY);
      if (raw === null) {
        throw new Error('expected pending EE build payload in sessionStorage');
      }
      const payload: EeBuildPendingPayload = JSON.parse(raw);
      expect(payload.entityRef).toBe('component:default/my-ee');
      expect(payload.savedAt).toEqual(expect.any(Number));
      throw new Error('oauth denied');
    });

    const showSpy = jest.spyOn(notificationStore, 'showNotification');
    const { result } = renderHook(() => useEEBuildFlow(), { wrapper });

    await act(async () => {
      await result.current.startBuildFlow(entityWithGithub);
    });

    expect(sessionStorage.getItem(EE_BUILD_PENDING_SESSION_KEY)).toBeNull();
    expect(showSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Sign-in failed',
        severity: 'error',
        description: expect.stringContaining('oauth denied'),
      }),
    );
    expect(result.current.dialogOpen).toBe(false);
    showSpy.mockRestore();
  });

  it('resumes dialog when sessionStorage has a fresh pending payload', async () => {
    const resolvedEntity = {
      ...entityWithGithub,
      metadata: { ...entityWithGithub.metadata, title: 'Resolved' },
    };
    mockGetEntityByRef.mockResolvedValue(resolvedEntity);

    sessionStorage.setItem(
      EE_BUILD_PENDING_SESSION_KEY,
      JSON.stringify({
        entityRef: 'component:default/my-ee',
        savedAt: Date.now(),
      }),
    );

    const { result } = renderHook(() => useEEBuildFlow(), { wrapper });

    await waitFor(() => {
      expect(result.current.dialogOpen).toBe(true);
    });

    expect(mockGetEntityByRef).toHaveBeenCalledWith('component:default/my-ee');
    expect(mockGetCredentials).toHaveBeenCalledWith({
      url: 'https://github.com/acme/repo',
    });
    expect(result.current.buildEntity).toEqual(resolvedEntity);
    expect(result.current.scmToken).toBe('t');
    expect(sessionStorage.getItem(EE_BUILD_PENDING_SESSION_KEY)).toBeNull();
  });

  it('drops stale pending payload without calling catalog', async () => {
    sessionStorage.setItem(
      EE_BUILD_PENDING_SESSION_KEY,
      JSON.stringify({
        entityRef: 'component:default/my-ee',
        savedAt: Date.now() - EE_BUILD_PENDING_MAX_AGE_MS - 1,
      }),
    );

    const { result } = renderHook(() => useEEBuildFlow(), { wrapper });

    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    expect(mockGetEntityByRef).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(EE_BUILD_PENDING_SESSION_KEY)).toBeNull();
    expect(result.current.dialogOpen).toBe(false);
  });

  it('removes invalid JSON from sessionStorage', async () => {
    sessionStorage.setItem(EE_BUILD_PENDING_SESSION_KEY, '{not-json');

    renderHook(() => useEEBuildFlow(), { wrapper });

    await waitFor(() => {
      expect(sessionStorage.getItem(EE_BUILD_PENDING_SESSION_KEY)).toBeNull();
    });
    expect(mockGetEntityByRef).not.toHaveBeenCalled();
  });

  it('notifies when resume getEntityByRef returns undefined', async () => {
    const showSpy = jest.spyOn(notificationStore, 'showNotification');
    mockGetEntityByRef.mockResolvedValue(undefined);

    sessionStorage.setItem(
      EE_BUILD_PENDING_SESSION_KEY,
      JSON.stringify({
        entityRef: 'component:default/missing',
        savedAt: Date.now(),
      }),
    );

    const { result } = renderHook(() => useEEBuildFlow(), { wrapper });

    await waitFor(() => {
      expect(showSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Build',
          severity: 'error',
        }),
      );
    });

    expect(result.current.dialogOpen).toBe(false);
    showSpy.mockRestore();
  });

  it('closeDialog clears open state and entity', async () => {
    const { result } = renderHook(() => useEEBuildFlow(), { wrapper });

    await act(async () => {
      await result.current.startBuildFlow(entityWithGithub);
    });

    expect(result.current.dialogOpen).toBe(true);

    act(() => {
      result.current.closeDialog();
    });

    expect(result.current.dialogOpen).toBe(false);
    expect(result.current.buildEntity).toBeNull();
    expect(result.current.scmToken).toBeNull();
  });

  it('notifies when resume resolves entity without Git source metadata', async () => {
    const showSpy = jest.spyOn(notificationStore, 'showNotification');
    mockGetEntityByRef.mockResolvedValue(entityNoScm);

    sessionStorage.setItem(
      EE_BUILD_PENDING_SESSION_KEY,
      JSON.stringify({
        entityRef: 'component:default/plain',
        savedAt: Date.now(),
      }),
    );

    const { result } = renderHook(() => useEEBuildFlow(), { wrapper });

    await waitFor(() => {
      expect(showSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Build',
          severity: 'error',
          description: expect.stringContaining('no Git source metadata'),
        }),
      );
    });

    expect(result.current.dialogOpen).toBe(false);
    expect(mockGetCredentials).not.toHaveBeenCalled();
    showSpy.mockRestore();
  });

  it('notifies when resume getCredentials returns empty token', async () => {
    const showSpy = jest.spyOn(notificationStore, 'showNotification');
    mockGetEntityByRef.mockResolvedValue(entityWithGithub);
    mockGetCredentials.mockResolvedValue({ token: '  ', headers: {} });

    sessionStorage.setItem(
      EE_BUILD_PENDING_SESSION_KEY,
      JSON.stringify({
        entityRef: 'component:default/my-ee',
        savedAt: Date.now(),
      }),
    );

    const { result } = renderHook(() => useEEBuildFlow(), { wrapper });

    await waitFor(() => {
      expect(showSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Build',
          severity: 'error',
          description: expect.stringContaining('No Git token'),
        }),
      );
    });

    expect(result.current.dialogOpen).toBe(false);
    showSpy.mockRestore();
  });

  it('notifies when resume getCredentials throws', async () => {
    const showSpy = jest.spyOn(notificationStore, 'showNotification');
    mockGetEntityByRef.mockResolvedValue(entityWithGithub);
    mockGetCredentials.mockRejectedValue(new Error('auth failed'));

    sessionStorage.setItem(
      EE_BUILD_PENDING_SESSION_KEY,
      JSON.stringify({
        entityRef: 'component:default/my-ee',
        savedAt: Date.now(),
      }),
    );

    const { result } = renderHook(() => useEEBuildFlow(), { wrapper });

    await waitFor(() => {
      expect(showSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Sign-in failed',
          severity: 'error',
          description: expect.stringContaining('auth failed'),
        }),
      );
    });

    expect(result.current.dialogOpen).toBe(false);
    showSpy.mockRestore();
  });

  it('notifies when resume getEntityByRef rejects', async () => {
    const showSpy = jest.spyOn(notificationStore, 'showNotification');
    mockGetEntityByRef.mockRejectedValue(new Error('catalog down'));

    sessionStorage.setItem(
      EE_BUILD_PENDING_SESSION_KEY,
      JSON.stringify({
        entityRef: 'component:default/my-ee',
        savedAt: Date.now(),
      }),
    );

    const { result } = renderHook(() => useEEBuildFlow(), { wrapper });

    await waitFor(() => {
      expect(showSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Build',
          severity: 'error',
          description: expect.stringContaining('Could not load'),
        }),
      );
    });

    expect(result.current.dialogOpen).toBe(false);
    showSpy.mockRestore();
  });

  it('drops pending payload when entityRef is missing', async () => {
    sessionStorage.setItem(
      EE_BUILD_PENDING_SESSION_KEY,
      JSON.stringify({
        savedAt: Date.now(),
      }),
    );

    const { result } = renderHook(() => useEEBuildFlow(), { wrapper });

    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    expect(mockGetEntityByRef).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(EE_BUILD_PENDING_SESSION_KEY)).toBeNull();
    expect(result.current.dialogOpen).toBe(false);
  });

  it('skips processing when component unmounts before getEntityByRef resolves', async () => {
    let resolveEntity!: (v: Entity | undefined) => void;
    mockGetEntityByRef.mockReturnValue(
      new Promise<Entity | undefined>(r => {
        resolveEntity = r;
      }),
    );
    const showSpy = jest.spyOn(notificationStore, 'showNotification');

    sessionStorage.setItem(
      EE_BUILD_PENDING_SESSION_KEY,
      JSON.stringify({
        entityRef: 'component:default/my-ee',
        savedAt: Date.now(),
      }),
    );

    const { unmount } = renderHook(() => useEEBuildFlow(), { wrapper });

    unmount();

    await act(async () => {
      resolveEntity(entityWithGithub);
      await new Promise(r => setTimeout(r, 0));
    });

    expect(showSpy).not.toHaveBeenCalled();
    showSpy.mockRestore();
  });

  it('skips processing when component unmounts before getCredentials resolves', async () => {
    let resolveCreds!: (v: { token: string; headers: object }) => void;
    mockGetEntityByRef.mockResolvedValue(entityWithGithub);
    mockGetCredentials.mockReturnValue(
      new Promise<{ token: string; headers: object }>(r => {
        resolveCreds = r;
      }),
    );
    const showSpy = jest.spyOn(notificationStore, 'showNotification');

    sessionStorage.setItem(
      EE_BUILD_PENDING_SESSION_KEY,
      JSON.stringify({
        entityRef: 'component:default/my-ee',
        savedAt: Date.now(),
      }),
    );

    const { unmount } = renderHook(() => useEEBuildFlow(), { wrapper });

    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    unmount();

    await act(async () => {
      resolveCreds({ token: 'abc', headers: {} });
      await new Promise(r => setTimeout(r, 0));
    });

    expect(showSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sign-in failed' }),
    );
    showSpy.mockRestore();
  });

  it('prevents concurrent startBuildFlow calls', async () => {
    let resolveCreds!: (v: { token: string; headers: object }) => void;
    mockGetCredentials.mockReturnValue(
      new Promise<{ token: string; headers: object }>(r => {
        resolveCreds = r;
      }),
    );

    const { result } = renderHook(() => useEEBuildFlow(), { wrapper });

    act(() => {
      result.current.startBuildFlow(entityWithGithub);
    });

    await act(async () => {
      await result.current.startBuildFlow(entityWithGithub);
    });

    expect(mockGetCredentials).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreds({ token: 'tok', headers: {} });
      await new Promise(r => setTimeout(r, 0));
    });
  });

  it('shows notification and does not open dialog when getCredentials returns an empty token', async () => {
    mockGetCredentials.mockResolvedValue({ token: '  ', headers: {} });
    const showSpy = jest.spyOn(notificationStore, 'showNotification');
    const { result } = renderHook(() => useEEBuildFlow(), { wrapper });

    await act(async () => {
      await result.current.startBuildFlow(entityWithGithub);
    });

    expect(showSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Cannot start build',
        severity: 'error',
      }),
    );
    expect(result.current.dialogOpen).toBe(false);
    expect(result.current.scmToken).toBeNull();
    showSpy.mockRestore();
  });
});
