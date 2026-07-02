import { createAuthContextFixture } from './create-auth-context';

export const test = createAuthContextFixture('Shared Context', () => undefined);

export { expect } from '@playwright/test';
