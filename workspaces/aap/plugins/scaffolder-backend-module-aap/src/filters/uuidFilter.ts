import { randomBytes } from 'node:crypto';

export const uuidFilter = (): string => {
  return randomBytes(4).toString('hex');
};
