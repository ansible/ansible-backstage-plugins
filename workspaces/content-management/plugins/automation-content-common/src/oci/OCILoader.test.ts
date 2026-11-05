/** @jest-environment node */
// Generated with AI assistance: OpenCode (OpenAI)
import type { OCIClient } from './OCIClient';

it('loads undici lazily, falls back to CommonJS after import rejection, and caches the module', async () => {
  let attempts = 0;
  const close = jest.fn().mockResolvedValue(undefined);
  const fetch = jest.fn().mockResolvedValue(new Response('{}'));
  const Agent = jest.fn().mockImplementation(() => ({ close }));
  jest.doMock('undici', () => {
    attempts += 1;
    if (attempts === 1) throw new Error('dynamic import unavailable');
    return { Agent, fetch };
  });
  let client!: OCIClient;
  jest.isolateModules(() => {
    // An isolated client has a fresh lazy-module cache.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('./OCIClient') as typeof import('./OCIClient');
    client = new module.OCIClient({
      name: 'lazy',
      url: 'https://registry.example',
      auth: { type: 'anonymous' },
    });
  });
  try {
    expect(attempts).toBe(0);
    await expect(client.ping()).resolves.toMatchObject({ ok: true });
    await expect(client.ping()).resolves.toMatchObject({ ok: true });
    expect(attempts).toBe(2);
    expect(Agent).toHaveBeenCalledTimes(1);
    expect(Agent).toHaveBeenCalledWith({
      connect: { rejectUnauthorized: true },
    });
    await client.dispose();
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    jest.dontMock('undici');
  }
});
