/**
 * HTTP failure from an AAP controller/gateway request.
 * Extends Error so existing catch blocks keep working without changes.
 * Callers that care about auth can check `status === 401`.
 */
export class AapHttpError extends Error {
  readonly name = 'AapHttpError';
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, AapHttpError.prototype);
  }
}

export function isAapHttpError(error: unknown): error is AapHttpError {
  return error instanceof AapHttpError;
}

export function isAapUnauthorizedError(error: unknown): boolean {
  return isAapHttpError(error) && error.status === 401;
}
