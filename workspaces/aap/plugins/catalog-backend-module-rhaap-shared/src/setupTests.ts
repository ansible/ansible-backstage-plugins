/*
 * Copyright 2026 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import '@testing-library/jest-dom';
import 'cross-fetch/polyfill';

// eslint-disable-next-line no-restricted-imports
import { clearImmediate, setImmediate } from 'node:timers';
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';
import { ReadableStream, WritableStream } from 'web-streams-polyfill';

// Express/supertest need Node timers when Jest runs a non-node environment.
Object.defineProperty(globalThis, 'setImmediate', {
  value: setImmediate,
});
Object.defineProperty(globalThis, 'clearImmediate', {
  value: clearImmediate,
});

const selfTarget =
  typeof globalThis.self !== 'undefined' ? globalThis.self : globalThis;

// Use Node's native WebCrypto so crypto.subtle.digest produces real digests
// in tests. An identity shim would mask hashing defects (No-Weak-Crypto).
Object.defineProperty(selfTarget, 'crypto', {
  value: webcrypto,
});

Object.defineProperty(selfTarget, 'TextEncoder', {
  value: TextEncoder,
});
Object.defineProperty(selfTarget, 'TextDecoder', {
  value: TextDecoder,
});
Object.defineProperty(globalThis, 'TextEncoder', {
  value: TextEncoder,
});
Object.defineProperty(globalThis, 'TextDecoder', {
  value: TextDecoder,
});

Object.defineProperty(selfTarget, 'ReadableStream', {
  value: ReadableStream,
});
Object.defineProperty(selfTarget, 'WritableStream', {
  value: WritableStream,
});
