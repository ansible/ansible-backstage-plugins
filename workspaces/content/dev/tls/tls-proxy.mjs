/**
 * TLS-terminating proxy for the portal demo (dev/tls).
 *
 * The same local Quay, reachable three ways:
 *
 *   http://host.containers.internal:8080   Quay itself (plain HTTP)
 *   https://host.containers.internal:8443  this proxy, trusted certificate
 *   https://host.containers.internal:8444  this proxy, untrusted certificate
 *
 * The Portal configures one registry per door, side by side, so the whole TLS
 * story is visible without restarting anything: verified HTTPS succeeds, an
 * untrusted certificate is refused, and plain HTTP only works through the
 * explicit `insecure: true` opt-out.
 *
 * Binds 0.0.0.0 so podman containers can reach it via host.containers.internal.
 * Forwards method, path, headers and body unchanged; the registry behind sees
 * the same client it always would.
 *
 * Usage: node dev/tls/tls-proxy.mjs [--upstream http://127.0.0.1:8080]
 */
import { createServer as createHttpsServer } from 'node:https';
import { request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const CERTS = join(HERE, 'certs');

const args = process.argv.slice(2);
const upstreamArg = args.indexOf('--upstream');
const upstream = new URL(
  upstreamArg >= 0 ? args[upstreamArg + 1] : 'http://127.0.0.1:8080',
);

async function certPair(name) {
  const [cert, key] = await Promise.all([
    readFile(join(CERTS, `${name}.pem`), 'utf8'),
    readFile(join(CERTS, `${name}-key.pem`), 'utf8'),
  ]);
  return { cert, key };
}

const seen = new Set();

function forward(req, res) {
  const options = {
    protocol: upstream.protocol,
    hostname: upstream.hostname,
    port: upstream.port,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: `${upstream.hostname}:${upstream.port}` },
  };
  const upstreamReq = httpRequest(options, upstreamRes => {
    res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstreamReq.on('error', error => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain' });
    }
    res.end(`proxy upstream error: ${error.message}`);
  });
  req.pipe(upstreamReq);
}

const label = (req, res, next) => {
  const key = `${req.method} ${req.url}`;
  if (!seen.has(key)) {
    seen.add(key);
    console.log(`[proxy] ${key}`);
  }
  next(req, res);
};

const trusted = await certPair('demo-trusted-server');
const untrusted = await certPair('demo-untrusted-server');

await Promise.all([
  new Promise(resolve => {
    createHttpsServer(trusted, (req, res) => label(req, res, forward)).listen(
      8443,
      '0.0.0.0',
      resolve,
    );
  }),
  new Promise(resolve => {
    createHttpsServer(untrusted, (req, res) => label(req, res, forward)).listen(
      8444,
      '0.0.0.0',
      resolve,
    );
  }),
]);

console.log(
  `TLS proxy up: :8443 (trusted) and :8444 (untrusted) → ${upstream}`,
);
console.log('Both doors serve the same Quay; only the certificate differs.');
