/**
 * @ansible/content-model
 *
 * The shared content contract. Types and pure helpers only — no runtime dependencies,
 * no Backstage imports, no I/O.
 *
 * This package is deliberately owned by neither the Portal plugins nor the content
 * management backend. Both consume it. Putting it inside either would make one repo's
 * release cycle govern a schema it only half owns.
 */
export * from './contentObject';
export * from './contentManifest';
