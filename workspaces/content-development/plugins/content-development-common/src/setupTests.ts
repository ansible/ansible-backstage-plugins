import { TextDecoder, TextEncoder } from 'node:util';
import { ReadableStream, WritableStream } from 'node:stream/web';

Object.assign(globalThis, {
  TextDecoder,
  TextEncoder,
  ReadableStream,
  WritableStream,
});
