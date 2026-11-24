// Generated with AI assistance: OpenCode (OpenAI)

import { randomBytes } from 'node:crypto';

export interface FakeRegistryCredentials {
  password: string;
  token: string;
  urlPasswordDecoded: string;
  urlPasswordEncoded: string;
}

/** Generate non-persistent fixture credentials without embedding secrets in tests. */
export function fakeRegistryCredentials(): FakeRegistryCredentials {
  const suffix = randomBytes(12).toString('hex');
  const urlPasswordDecoded = `fake@${suffix.slice(0, 10)}`;

  return {
    password: `fake-password-${suffix}`,
    token: `fake-token-${suffix}`,
    urlPasswordDecoded,
    urlPasswordEncoded: encodeURIComponent(urlPasswordDecoded),
  };
}
