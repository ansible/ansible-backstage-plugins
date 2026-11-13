/*
 * Copyright 2025 The Ansible plugin Authors
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
import { TextEncoder, TextDecoder } from 'node:util';
import { ReadableStream, WritableStream } from 'web-streams-polyfill';

const selfTarget =
  typeof globalThis.self !== 'undefined' ? globalThis.self : globalThis;

// Mock browser crypto.subtle.digest method for sha-256 hashing.
Object.defineProperty(selfTarget, 'crypto', {
  value: {
    subtle: {
      digest: (_algo: string, data: Uint8Array): ArrayBuffer => data.buffer,
    },
  },
});

// Also used in browser-based APIs for hashing.
Object.defineProperty(selfTarget, 'TextEncoder', {
  value: TextEncoder,
});

Object.defineProperty(selfTarget, 'TextDecoder', {
  value: TextDecoder,
});

Object.defineProperty(selfTarget, 'ReadableStream', {
  value: ReadableStream,
});
Object.defineProperty(selfTarget, 'WritableStream', {
  value: WritableStream,
});
