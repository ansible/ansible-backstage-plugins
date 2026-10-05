import '@testing-library/jest-dom';
import 'cross-fetch/polyfill';
// eslint-disable-next-line no-restricted-imports
import { TextEncoder, TextDecoder } from 'node:util';
import { ReadableStream, WritableStream } from 'web-streams-polyfill';

// Polyfill TextEncoder/TextDecoder for Node 18+
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as typeof global.TextDecoder;

// Polyfill streams for undici/fetch compatibility
Object.defineProperty(globalThis.self, 'TextEncoder', {
  value: TextEncoder,
});
Object.defineProperty(globalThis.self, 'TextDecoder', {
  value: TextDecoder,
});
Object.defineProperty(globalThis.self, 'ReadableStream', {
  value: ReadableStream,
});
Object.defineProperty(globalThis.self, 'WritableStream', {
  value: WritableStream,
});

// Backstage bundles style-inject, so the module mock cannot intercept it.
// Ignore CSS text insertion to prevent JSDOM stylesheet parser noise.
if (typeof HTMLStyleElement !== 'undefined') {
  const appendChild = HTMLStyleElement.prototype.appendChild;
  HTMLStyleElement.prototype.appendChild = function appendStyleText<
    T extends Node,
  >(node: T): T {
    if (node.nodeType === Node.TEXT_NODE) return node;
    appendChild.call(this, node);
    return node;
  };
}

// Increase default timeout for async tests (Node 20 is slower than Node 22)
jest.setTimeout(15000);
