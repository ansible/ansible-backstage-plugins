import type { ResolvedArtifact } from '../oci/types';

export interface KeyRef {
  id: string;
  /** Where the key material lives. Never the material itself. */
  uri: string;
}

export interface Signature {
  algorithm: string;
  keyId: string;
  value: string;
  createdAt: string;
}

export interface VerificationPolicy {
  /** Reject unsigned content outright. */
  requireSigned: boolean;
  /** Key ids or identities accepted. Empty means any valid signature. */
  trustedKeys?: string[];
  /** Algorithms permitted — the hook for mandating PQC once available. */
  allowedAlgorithms?: string[];
}

export interface VerificationResult {
  verified: boolean;
  signed: boolean;
  algorithm?: string;
  keyId?: string;
  /** Why verification failed, for honest display rather than a bare boolean. */
  reason?: string;
}

/** A signature in a form that survives an air-gap transfer. */
export interface PortableSignature {
  subjectDigest: string;
  providerId: string;
  payload: string;
  metadata?: Record<string, string>;
}

/**
 * The signing axis.
 *
 * The requirement asks for "image signing and policy-based verification mechanisms" —
 * mechanisms, not a named tool. So no tool appears in the architecture: Sigstore/Cosign,
 * OpenPGP implementations, registry-native signing and future post-quantum schemes are
 * all conformant implementations selected by deployment configuration.
 *
 * This matters for more than neutrality. Air-gapped operation is a hard requirement, and
 * signing tools differ in whether they can sign and verify without reaching a
 * transparency log or network service. Expressing that as `offlineCapable` makes it a
 * queryable property of a component rather than a property of the architecture — so the
 * air-gap question is answered by configuration, and adding post-quantum algorithms
 * later does not require rearchitecting.
 */
export interface SigningProvider {
  /** 'cosign' | 'openpgp' | 'registry-native' | … */
  readonly id: string;

  /** Can this provider sign and verify with no network access? */
  readonly offlineCapable: boolean;

  /** Algorithms supported, including post-quantum where available. */
  readonly algorithms: string[];

  sign(ref: ResolvedArtifact, key: KeyRef): Promise<Signature>;

  verify(
    ref: ResolvedArtifact,
    policy: VerificationPolicy,
  ): Promise<VerificationResult>;

  /** Export for transfer across a network boundary. */
  export(ref: ResolvedArtifact): Promise<PortableSignature | undefined>;

  /** Import a signature carried in from a connected environment. */
  import(signature: PortableSignature): Promise<void>;
}

/**
 * The provider used when signing is not configured.
 *
 * It reports content as unsigned and unverified rather than claiming verification it
 * has not performed. A trust surface that defaults to "looks fine" is worse than one
 * that admits it does not know.
 */
export class NullSigningProvider implements SigningProvider {
  readonly id = 'none';
  readonly offlineCapable = true;
  readonly algorithms: string[] = [];

  async sign(): Promise<Signature> {
    throw new Error('No signing provider configured');
  }

  async verify(
    _ref: ResolvedArtifact,
    policy: VerificationPolicy,
  ): Promise<VerificationResult> {
    return {
      verified: false,
      signed: false,
      reason: policy.requireSigned
        ? 'Policy requires signed content but no signing provider is configured'
        : 'No signing provider configured',
    };
  }

  async export(): Promise<undefined> {
    return undefined;
  }

  async import(): Promise<void> {
    throw new Error('No signing provider configured');
  }
}
