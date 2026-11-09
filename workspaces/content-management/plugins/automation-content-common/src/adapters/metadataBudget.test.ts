import {
  assertMetadataDocument,
  validateNormalizedMetadata,
  METADATA_DOCUMENT_BYTE_LIMIT,
  METADATA_DEPTH_LIMIT,
  METADATA_NODE_LIMIT,
} from './metadataBudget';

it('accepts bounded JSON metadata and omitted optional fields', () => {
  expect(() =>
    validateNormalizedMetadata({
      authors: ['Utopia'],
      version: undefined,
      dependencies: { 'ansible.utils': '>=1.0' },
      description: 'Read-only diagnostics',
      supported: false,
      count: 2,
      missing: null,
    }),
  ).not.toThrow();
});

it('bounds UTF-8 parsing input separately from the archive limit', () => {
  expect(() =>
    assertMetadataDocument('A'.repeat(METADATA_DOCUMENT_BYTE_LIMIT)),
  ).not.toThrow();
  expect(() =>
    assertMetadataDocument('é'.repeat(METADATA_DOCUMENT_BYTE_LIMIT)),
  ).toThrow('document');
});

it('bounds normalized escaped string bytes without serializing metadata', () => {
  expect(() =>
    validateNormalizedMetadata({ description: '\u0000'.repeat(512 * 1024) }),
  ).toThrow('byte budget');
});

it('rejects recursive, over-deep, over-wide and non-JSON metadata', () => {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  expect(() => validateNormalizedMetadata(cycle)).toThrow('recursive');
  let deep: unknown = null;
  for (let i = 0; i <= METADATA_DEPTH_LIMIT; i++) deep = [deep];
  expect(() => validateNormalizedMetadata(deep)).toThrow('depth');
  expect(() =>
    validateNormalizedMetadata(Array(METADATA_NODE_LIMIT + 1).fill(0)),
  ).toThrow('node');
  expect(() => validateNormalizedMetadata({ count: Infinity })).toThrow('JSON');
});
