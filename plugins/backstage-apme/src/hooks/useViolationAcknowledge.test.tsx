/*
 * Copyright Red Hat
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import type { ReactNode } from 'react';
import type { Violation } from '@ansible/backstage-apme-common/types';
import { apmeApiRef } from '../api';
import { useViolationAcknowledge } from './useViolationAcknowledge';

describe('useViolationAcknowledge', () => {
  const createSuppression = jest.fn();

  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider apis={[[apmeApiRef, { createSuppression }]]}>
      {children}
    </TestApiProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    createSuppression.mockResolvedValue({ id: 1 });
  });

  const violation: Violation = {
    id: 42,
    rule_id: 'L001',
    level: 'medium',
    message: 'msg',
    file: 'a.yml',
    line: 1,
    remediation_class: 3,
    validator_source: 'native',
    original_yaml: 'debug: msg=hi',
  };

  it('creates a project-scoped suppression and tracks id', async () => {
    const { result } = renderHook(() => useViolationAcknowledge('proj-1'), {
      wrapper,
    });

    await act(async () => {
      await result.current.acknowledge(violation);
    });

    expect(createSuppression).toHaveBeenCalledWith({
      rule_id: 'L001',
      original_yaml: 'debug: msg=hi',
      fingerprint_mode: 'full',
      scope: 'project:proj-1',
      reason: 'Acknowledged via Quality triage',
    });
    expect(result.current.acknowledgedIds.has(42)).toBe(true);
  });

  it('treats 409 as already acknowledged', async () => {
    createSuppression.mockRejectedValueOnce({ status: 409 });
    const { result } = renderHook(() => useViolationAcknowledge('proj-1'), {
      wrapper,
    });

    await act(async () => {
      await result.current.acknowledge(violation);
    });

    await waitFor(() => {
      expect(result.current.acknowledgedIds.has(42)).toBe(true);
    });
    expect(result.current.ackError).toBeNull();
  });
});
