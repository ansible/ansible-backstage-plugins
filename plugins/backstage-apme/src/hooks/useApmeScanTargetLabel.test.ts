/*
 * Copyright Red Hat
 */

import { renderHook, waitFor } from '@testing-library/react';
import { configApiRef } from '@backstage/core-plugin-api';
import { useApmeScanTargetLabel } from './useApmeScanTargetLabel';
import { apmeApiRef } from '../api';

const mockGetPortalSettings = jest.fn();
const mockGetOptionalString = jest.fn().mockReturnValue(undefined);

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: (ref: { id: string }) => {
    if (ref === configApiRef) {
      return { getOptionalString: mockGetOptionalString };
    }
    if (ref === apmeApiRef) {
      return { getPortalSettings: mockGetPortalSettings };
    }
    throw new Error(`Unexpected api ref: ${ref.id}`);
  },
}));

describe('useApmeScanTargetLabel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetOptionalString.mockReturnValue(undefined);
    mockGetPortalSettings.mockResolvedValue({
      targetAnsibleCoreVersion: '2.16',
    });
  });

  it('returns portal default scan target', async () => {
    const { result } = renderHook(() => useApmeScanTargetLabel());

    await waitFor(() => {
      expect(result.current.effective).toBe('2.16');
    });

    expect(result.current.source).toBe('global');
    expect(result.current.label).toBe('ansible-core 2.16');
  });
});
