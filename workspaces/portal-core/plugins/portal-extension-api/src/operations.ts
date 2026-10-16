import {
  createApiFactory,
  createApiRef,
  discoveryApiRef,
  fetchApiRef,
  type DiscoveryApi,
  type FetchApi,
} from '@backstage/core-plugin-api';
import type {
  OperationRequest,
  OperationResponse,
} from '@ansible/portal-extension-common';

export interface PortalOperationsApi {
  execute(
    operationId: string,
    request: OperationRequest,
  ): Promise<OperationResponse>;
}

export const portalOperationsApiRef = createApiRef<PortalOperationsApi>({
  id: 'portal.operations',
});

/** Discovery and authenticated fetch are platform adapters, never manifest URLs. */
export class PortalOperationsClient implements PortalOperationsApi {
  constructor(
    private readonly discovery: DiscoveryApi,
    private readonly fetchApi: FetchApi,
  ) {}

  async execute(
    operationId: string,
    request: OperationRequest,
  ): Promise<OperationResponse> {
    const baseUrl = await this.discovery.getBaseUrl('portal-operations');
    const response = await this.fetchApi.fetch(
      `${baseUrl}/${encodeURIComponent(operationId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Operation ${operationId} failed (HTTP ${response.status})`,
      );
    }
    return response.json();
  }
}

export const portalOperationsApiFactory = createApiFactory({
  api: portalOperationsApiRef,
  deps: { discovery: discoveryApiRef, fetchApi: fetchApiRef },
  factory: ({ discovery, fetchApi }) =>
    new PortalOperationsClient(discovery, fetchApi),
});
