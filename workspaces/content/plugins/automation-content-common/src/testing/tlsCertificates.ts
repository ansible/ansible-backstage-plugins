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

function build(): TlsTestFixtures {
  const caKeys = rsaKeyPair();
  const serverKeys = rsaKeyPair();
  const CA_CN = 'automation-content test CA';

  const ca = issueCertificate({
    subjectCn: CA_CN,
    issuerCn: CA_CN,
    issuerKeys: caKeys,
    subjectKeys: caKeys,
    notBefore: daysFromNow(-1),
    notAfter: daysFromNow(3650),
    extensions: [
      { name: 'basicConstraints', cA: true, critical: true },
      { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    ],
  });

  const loopbackSan = [
    { type: 7, ip: '127.0.0.1' },
    { type: 2, value: 'localhost' },
  ];

  const trusted = issueCertificate({
    subjectCn: '127.0.0.1',
    issuerCn: CA_CN,
    issuerKeys: caKeys,
    subjectKeys: serverKeys,
    notBefore: daysFromNow(-1),
    notAfter: daysFromNow(3650),
    extensions: [{ name: 'subjectAltName', altNames: loopbackSan }],
  });
  const untrusted = issueCertificate({
    subjectCn: '127.0.0.1',
    issuerCn: '127.0.0.1',
    issuerKeys: serverKeys,
    subjectKeys: serverKeys,
    notBefore: daysFromNow(-1),
    notAfter: daysFromNow(3650),
    extensions: [{ name: 'subjectAltName', altNames: loopbackSan }],
  });
  const wrongHost = issueCertificate({
    subjectCn: 'wrong.example',
    issuerCn: CA_CN,
    issuerKeys: caKeys,
    subjectKeys: serverKeys,
    notBefore: daysFromNow(-1),
    notAfter: daysFromNow(3650),
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [{ type: 2, value: 'wrong.example' }],
      },
    ],
  });
  const expired = issueCertificate({
    subjectCn: '127.0.0.1',
    issuerCn: CA_CN,
    issuerKeys: caKeys,
    subjectKeys: serverKeys,
    notBefore: daysFromNow(-2),
    notAfter: daysFromNow(-1),
    extensions: [{ name: 'subjectAltName', altNames: loopbackSan }],
  });

  return {
    ca,
    trustedServer: { cert: trusted, key: serverKeys.privatePem },
    untrustedServer: { cert: untrusted, key: serverKeys.privatePem },
    wrongHostServer: { cert: wrongHost, key: serverKeys.privatePem },
    expiredServer: { cert: expired, key: serverKeys.privatePem },
  };
}

/** A fresh RSA-2048 pair, exported in the PEM forms forge consumes. */
function rsaKeyPair(): { privatePem: string; publicPem: string } {
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
