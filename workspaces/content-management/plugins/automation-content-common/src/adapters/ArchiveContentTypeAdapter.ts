import { gunzipSync } from 'zlib';
import { Header, Parser } from 'tar';
import {
  METADATA_DOCUMENT_BYTE_LIMIT,
  validateNormalizedMetadata,
} from './metadataBudget';
import type { ContentObject, Enumeration } from '@ansible/content-model';
import type {
  Classification,
  ContentTypeAdapter,
  EnumerationContext,
} from './ContentTypeAdapter';
import type { MetadataBundle, ResolvedArtifact } from '../oci/types';

/** Per-layer compressed and expanded byte budget; no archive is extracted to disk. */
export const ARCHIVE_BYTE_LIMIT = 16 * 1024 * 1024;
export const ARCHIVE_LAYER_MEDIA_TYPE =
  'application/vnd.oci.image.layer.v1.tar+gzip';

/** A content item described by metadata inside a distributable archive. */
export interface ArchiveItem {
  fqcn: string;
  name: string;
  type: string;
  version?: string;
  description?: string;
  detail: Record<string, unknown>;
}

/** Adapter-owned inventory, persisted without an EE-shaped content manifest. */
export interface ArchiveEnumeration extends Enumeration {
  items?: ArchiveItem[];
}

/** Read exactly one regular file at the archive root, validating the entire tar. */
export async function readArchiveFile(
  blob: Buffer,
  filename: string,
): Promise<string> {
  if (blob.length > ARCHIVE_BYTE_LIMIT)
    throw new Error('layer exceeds 16 MiB byte budget');
  const tar = gunzipSync(blob, { maxOutputLength: ARCHIVE_BYTE_LIMIT });
  if (
    (tar[0] === 0x1f && tar[1] === 0x8b) ||
    (tar.length >= 4 && tar.readUInt32LE(0) === 0xfd2fb528)
  ) {
    throw new Error('nested gzip/zstd archives are not supported');
  }
  // The parser can auto-decompress input. Require an actual ustar/GNU header
  // here so nested compression cannot bypass the expanded-byte budget above.
  if (tar.subarray(257, 262).toString('ascii') !== 'ustar') {
    throw new Error('expected a ustar/GNU tar archive after gzip decoding');
  }
  if (tar.length < 512 || !new Header(tar.subarray(0, 512)).cksumValid)
    throw new Error('invalid first tar header checksum');
  return new Promise((resolve, reject) => {
    let found: string | undefined;
    const parser = new Parser({
      strict: true,
      onReadEntry(entry) {
        const path = entry.path.replace(/^(\.\/)+/, '');
        if (path === filename && entry.type === 'File') {
          if (entry.size > METADATA_DOCUMENT_BYTE_LIMIT) {
            reject(new Error('metadata document exceeds 1 MiB byte budget'));
            entry.resume();
            return;
          }
          if (found !== undefined) {
            reject(new Error(`duplicate ${filename}`));
          }
          const chunks: Buffer[] = [];
          entry.on('data', chunk => chunks.push(Buffer.from(chunk)));
          entry.on('end', () => {
            found = Buffer.concat(chunks).toString('utf8');
          });
        } else {
          entry.resume();
        }
      },
    });
    parser.on('error', reject);
    parser.on('end', () =>
      found === undefined
        ? reject(new Error(`${filename} not found at archive root`))
        : resolve(found),
    );
    parser.end(tar);
  });
}

/** Infrastructure for small metadata-bearing archives; concrete adapters own semantics. */
export abstract class ArchiveContentTypeAdapter implements ContentTypeAdapter {
  abstract readonly type: string;
  abstract readonly mediaTypes: string[];
  abstract readonly filename: string;
  readonly schema = {
    $id: 'https://ansible.com/schemas/archive-inventory',
    version: '1.0.0',
  };
  readonly updatePolicy = {
    kind: 'digest-compare' as const,
    shouldUpdate: (
      previous: ContentObject | undefined,
      current: ResolvedArtifact,
    ): boolean => previous?.identity.digest !== current.digest,
  };

  identify(ref: ResolvedArtifact, _meta: MetadataBundle): Classification {
    const matches = this.mediaTypes.includes(ref.manifest.artifactType ?? '');
    return {
      confidence: matches ? 'certain' : 'no',
      signals: [
        matches
          ? `artifactType ${ref.manifest.artifactType}`
          : 'no matching artifactType',
      ],
    };
  }

  async normalize(
    ref: ResolvedArtifact,
    _meta: MetadataBundle,
  ): Promise<ContentObject> {
    const annotations = ref.manifest.annotations ?? {};
    return {
      identity: {
        type: this.type,
        namespace: '',
        name: annotations['org.opencontainers.image.title'] ?? ref.repository,
        digest: ref.digest,
      },
      version: {
        value: annotations['org.opencontainers.image.version'] ?? ref.digest,
        scheme: 'oci-tag',
      },
      source: {
        uri: `${ref.registry}/${ref.repository}@${ref.digest}`,
        backendId: 'oci',
        discoveredAt: new Date().toISOString(),
      },
      lifecycle: { state: 'discovered', visibility: 'internal' },
      trust: {
        certificationTier: 'community',
        provenance: { steps: [], complete: false },
        signing: { signed: false, verified: false },
        supportBoundary: { supported: false },
      },
      relationships: [],
      enumeration: {
        status: 'unknown',
        source: 'blob-fetch',
        schemaVersion: this.schema.version,
        diagnostics: ['not yet enumerated'],
      },
    };
  }

  /** Interpret the metadata document; malformed documents must throw. */
  abstract parse(document: string): ArchiveItem[];

  async enumerate(
    ref: ResolvedArtifact,
    ctx: EnumerationContext,
  ): Promise<ArchiveEnumeration> {
    const base = {
      source: 'blob-fetch' as const,
      schemaVersion: this.schema.version,
    };
    try {
      const layers = 'layers' in ref.manifest ? ref.manifest.layers : [];
      if (
        layers.length !== 1 ||
        layers[0].mediaType !== ARCHIVE_LAYER_MEDIA_TYPE
      )
        throw new Error('expected a single tar+gzip layer');
      const layer = layers[0];
      if (layer.size > ARCHIVE_BYTE_LIMIT)
        return {
          ...base,
          status: 'partial',
          diagnostics: ['layer exceeds 16 MiB byte budget; contents not read'],
        };
      if (!ctx.backend.fetchBlob)
        throw new Error('backend cannot retrieve layer payloads');
      const blob = await ctx.backend.fetchBlob(ref, layer, ARCHIVE_BYTE_LIMIT);
      if (!blob) throw new Error('layer payload unavailable');
      if (blob.length > ARCHIVE_BYTE_LIMIT)
        return {
          ...base,
          status: 'partial',
          diagnostics: ['layer exceeds 16 MiB byte budget; contents not read'],
        };
      const items = this.parse(await readArchiveFile(blob, this.filename));
      validateNormalizedMetadata(items);
      return {
        ...base,
        status: 'complete',
        extractedAt: new Date().toISOString(),
        items,
        diagnostics: items.length
          ? undefined
          : ['metadata document contains no items'],
      };
    } catch (error) {
      const reason =
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string'
          ? error.message
          : 'archive enumeration failed';
      return {
        ...base,
        status: /budget|larger than|buffer too large/i.test(reason)
          ? 'partial'
          : 'unknown',
        diagnostics: [reason],
      };
    }
  }
}
