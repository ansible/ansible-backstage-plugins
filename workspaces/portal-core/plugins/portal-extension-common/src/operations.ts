/** The host passes identity, not plugin URLs or backend project IDs. */
export interface OperationRequest {
  subject: { entityRef: string };
  input?: Record<string, unknown>;
}

export interface OperationResponse {
  result: unknown;
}
