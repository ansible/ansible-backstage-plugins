import {
  AapHttpError,
  isAapHttpError,
  isAapUnauthorizedError,
} from './AapHttpError';

describe('AapHttpError', () => {
  it('is an Error with a status code', () => {
    const error = new AapHttpError(401, 'unauthorized');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AapHttpError);
    expect(error.status).toBe(401);
    expect(error.message).toBe('unauthorized');
  });

  it('identifies unauthorized failures by status', () => {
    expect(isAapUnauthorizedError(new AapHttpError(401, 'x'))).toBe(true);
    expect(isAapUnauthorizedError(new AapHttpError(502, 'x'))).toBe(false);
    expect(isAapUnauthorizedError(new Error('x'))).toBe(false);
    expect(isAapHttpError(new AapHttpError(500, 'x'))).toBe(true);
  });
});
