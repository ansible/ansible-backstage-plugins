/** @jest-environment node */
// Generated with AI assistance: OpenCode (OpenAI)
import { Socket } from 'node:net';
import type { buildConnector } from 'undici';
import { createAdditiveTrustConnector } from './AdditiveTrustConnector';

const target: buildConnector.Options = {
  hostname: 'registry.example',
  protocol: 'https:',
  port: '443',
};

function connectors() {
  const defaults = jest.fn<void, Parameters<buildConnector.connector>>();
  const bundle = jest.fn<void, Parameters<buildConnector.connector>>();
  const build = jest
    .fn()
    .mockReturnValueOnce(defaults)
    .mockReturnValueOnce(bundle);
  const connect = createAdditiveTrustConnector(
    { buildConnector: build },
    { ca: 'test-ca' },
  );
  return { defaults, bundle, build, connect };
}

it('pins verification in separate stores and returns a default-trusted socket without retrying', () => {
  const { defaults, bundle, build, connect } = connectors();
  const socket = new Socket();
  const callback = jest.fn();
  defaults.mockImplementation((_, done) => done(null, socket));
  connect(target, callback);
  expect(build.mock.calls).toEqual([
    [{ rejectUnauthorized: true }],
    [{ rejectUnauthorized: true, ca: 'test-ca' }],
  ]);
  expect(defaults).toHaveBeenCalledWith(target, expect.any(Function));
  expect(bundle).not.toHaveBeenCalled();
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith(null, socket);
  socket.destroy();
});

it.each([
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
])('retries chain rejection %s against the bundle', code => {
  const { defaults, bundle, connect } = connectors();
  const socket = new Socket();
  defaults.mockImplementation((_, done) =>
    done(Object.assign(new Error('untrusted'), { code }), null),
  );
  bundle.mockImplementation((_, done) => done(null, socket));
  const callback = jest.fn();
  connect(target, callback);
  expect(bundle).toHaveBeenCalledWith(target, expect.any(Function));
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith(null, socket);
  socket.destroy();
});

it.each([
  Object.assign(new Error('expired'), { code: 'CERT_HAS_EXPIRED' }),
  Object.assign(new Error('hostname'), {
    code: 'ERR_TLS_CERT_ALTNAME_INVALID',
  }),
  Object.assign(new Error('protocol'), { code: 'EPROTO' }),
  new Error('no code'),
  { code: 123 },
  'non-object rejection',
])('does not retry non-chain failures %p', error => {
  const { defaults, bundle, connect } = connectors();
  // Hostile connector errors may not satisfy the declared Error shape.
  defaults.mockImplementation((_, done) => done(error as Error, null));
  const callback = jest.fn();
  connect(target, callback);
  expect(bundle).not.toHaveBeenCalled();
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith(error, null);
});

it('returns the configured bundle error when both stores reject the certificate', () => {
  const { defaults, bundle, connect } = connectors();
  defaults.mockImplementation((_, done) =>
    done(
      Object.assign(new Error('default'), {
        code: 'SELF_SIGNED_CERT_IN_CHAIN',
      }),
      null,
    ),
  );
  const error = new Error('bundle rejected');
  bundle.mockImplementation((_, done) => done(error, null));
  const callback = jest.fn();
  connect(target, callback);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith(error, null);
});
