/**
 * Runtime TLS fixtures for the transport-trust tests.
 *
 * The certificates this module produces mirror the four scenarios the policy
 * must distinguish: a CA-trusted server, a self-signed server, a CA-signed
 * server for the wrong hostname, and an expired one. No private keys are
 * committed to the repository — gitleaks and the pre-commit private-key guard
 * would (rightly) refuse them — so the fixtures are generated when the first
 * test asks for them and cached for the rest of the run.
 *
 * Test infrastructure only: deliberately not exported from the package barrel,
 * so it can never reach a published bundle.
 */
import { generateKeyPairSync, randomBytes } from 'node:crypto';
// Test infrastructure, deliberately kept out of `dependencies`: this module is
// not exported from the barrel, so node-forge never reaches a published bundle.
// eslint-disable-next-line @backstage/no-undeclared-imports
import * as forge from 'node-forge';

/** A PEM certificate next to the PEM private key it authenticates. */
export interface CertificatePair {
  cert: string;
  key: string;
}

/** Every certificate shape the transport-trust suite needs, in PEM form. */
export interface TlsTestFixtures {
  /** The CA every trusted fixture chains to; pass as `ca` on the connection. */
  ca: string;
  /** CA-signed for 127.0.0.1 — must be accepted. */
  trustedServer: CertificatePair;
  /** Self-signed — must fail chain validation. */
  untrustedServer: CertificatePair;
  /** CA-signed, but only for wrong.example — must fail hostname validation. */
  wrongHostServer: CertificatePair;
  /** CA-signed for 127.0.0.1, but its validity window closed yesterday. */
  expiredServer: CertificatePair;
}

let cached: TlsTestFixtures | undefined;

/** Generate (once per process) the TLS fixtures for a test run. */
export function generateTlsTestFixtures(): TlsTestFixtures {
  cached ??= build();
  return cached;
}

/** A CA independent of the shared fixtures, with one server it has signed. */
export interface StandaloneCa {
  /** The CA certificate, PEM — trusted as `ca` on a connection, or installed as a process root. */
  ca: string;
  /** A loopback server certificate chaining to the CA. */
  server: CertificatePair;
}

/**
 * A CA independent of the shared fixtures, with one server it has signed.
 *
 * The process-trust tests need several CAs at once, each playing a different
 * role: one the connection trusts through `ca`, one the process itself
 * trusts (installed through `NODE_EXTRA_CA_CERTS` before startup, which is
 * why those tests run in a subprocess), and one nobody trusts. The shared
 * fixtures have a single CA, which cannot demonstrate trust arriving from
 * two directions.
 */
export function generateStandaloneCa(cn: string): StandaloneCa {
  const ca = issueTestCa(cn);
  return { ca: ca.pem, server: issueLoopbackServerCertificate(ca) };
}

/** Extensions every test CA carries: it must be able to sign certificates. */
const CA_EXTENSIONS = [
  { name: 'basicConstraints', cA: true, critical: true },
  { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
];

/** SANs valid for the loopback interface, where every test server listens. */
const LOOPBACK_SAN = [
  { type: 7, ip: '127.0.0.1' },
  { type: 2, value: 'localhost' },
];

/** A key pair in the PEM forms forge consumes. */
interface KeyPair {
  privatePem: string;
  publicPem: string;
}

/** A test certificate authority: its certificate, and the pair that signed it. */
interface TestCa {
  pem: string;
  keys: KeyPair;
  /** The CN certificates issued by this CA are signed with. */
  cn: string;
}

function issueTestCa(cn: string): TestCa {
  const keys = rsaKeyPair();
  return {
    pem: issueCertificate({
      subjectCn: cn,
      issuerCn: cn,
      issuerKeys: keys,
      subjectKeys: keys,
      notBefore: daysFromNow(-1),
      notAfter: daysFromNow(3650),
      extensions: CA_EXTENSIONS,
    }),
    keys,
    cn,
  };
}

/**
 * A loopback server certificate signed by a test CA.
 *
 * The options exist for the fixture shapes the policy must distinguish: a
 * shared key pair (the fixtures vary by certificate, not key material), a
 * validity window that has closed, and SANs for the wrong hostname.
 */
function issueLoopbackServerCertificate(
  ca: TestCa,
  options: {
    subjectCn?: string;
    subjectKeys?: KeyPair;
    notBefore?: Date;
    notAfter?: Date;
    altNames?: unknown[];
  } = {},
): CertificatePair {
  const subjectKeys = options.subjectKeys ?? rsaKeyPair();
  return {
    cert: issueCertificate({
      subjectCn: options.subjectCn ?? '127.0.0.1',
      issuerCn: ca.cn,
      issuerKeys: ca.keys,
      subjectKeys,
      notBefore: options.notBefore ?? daysFromNow(-1),
      notAfter: options.notAfter ?? daysFromNow(3650),
      extensions: [
        {
          name: 'subjectAltName',
          altNames: options.altNames ?? LOOPBACK_SAN,
        },
      ],
    }),
    key: subjectKeys.privatePem,
  };
}

function build(): TlsTestFixtures {
  const ca = issueTestCa('automation-content test CA');
  // One key pair shared by the server fixtures: they vary by certificate —
  // issuer, hostname, validity — not by key material.
  const serverKeys = rsaKeyPair();

  return {
    ca: ca.pem,
    trustedServer: issueLoopbackServerCertificate(ca, {
      subjectKeys: serverKeys,
    }),
    untrustedServer: {
      // Self-signed: the subject is its own issuer, so no store that does not
      // already hold the certificate itself can trust it.
      cert: issueCertificate({
        subjectCn: '127.0.0.1',
        issuerCn: '127.0.0.1',
        issuerKeys: serverKeys,
        subjectKeys: serverKeys,
        notBefore: daysFromNow(-1),
        notAfter: daysFromNow(3650),
        extensions: [{ name: 'subjectAltName', altNames: LOOPBACK_SAN }],
      }),
      key: serverKeys.privatePem,
    },
    wrongHostServer: issueLoopbackServerCertificate(ca, {
      subjectCn: 'wrong.example',
      subjectKeys: serverKeys,
      altNames: [{ type: 2, value: 'wrong.example' }],
    }),
    expiredServer: issueLoopbackServerCertificate(ca, {
      subjectKeys: serverKeys,
      notBefore: daysFromNow(-2),
      notAfter: daysFromNow(-1),
    }),
  };
}

/** A fresh RSA-2048 pair, exported in the PEM forms forge consumes. */
function rsaKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  return {
    privatePem: privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

/**
 * Build one certificate from a signing request shape.
 *
 * The options are split into subject/issuer pairs so the same helper covers
 * both CA-signed and self-signed fixtures, plus X.509 extensions the policy
 * must honour (CA constraints, subject alternative names, validity window).
 */
function issueCertificate(options: {
  subjectCn: string;
  /** The CA's subject CN; equals `subjectCn` for self-signed certificates. */
  issuerCn: string;
  /** The pair that signs — for self-signed, the subject's own pair. */
  issuerKeys: { privatePem: string; publicPem: string };
  subjectKeys: { privatePem: string; publicPem: string };
  notBefore: Date;
  notAfter: Date;
  extensions: unknown[];
}): string {
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(options.subjectKeys.publicPem);
  cert.serialNumber = randomBytes(16).toString('hex');
  cert.validity.notBefore = options.notBefore;
  cert.validity.notAfter = options.notAfter;
  cert.setSubject([{ name: 'commonName', value: options.subjectCn }]);
  cert.setIssuer([{ name: 'commonName', value: options.issuerCn }]);
  cert.setExtensions(
    options.extensions as Parameters<typeof cert.setExtensions>[0],
  );
  cert.sign(
    forge.pki.privateKeyFromPem(options.issuerKeys.privatePem),
    forge.md.sha256.create(),
  );
  return forge.pki.certificateToPem(cert);
}

/** A date `days` from now — negative for already-expired fixtures. */
function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
