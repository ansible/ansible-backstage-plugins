import assert from 'node:assert/strict';
import { posix } from 'node:path';

function targets(value) {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([condition, target]) => {
      // Backstage prepack adds feature-discovery markers to conditional exports.
      if (
        condition === 'backstage' &&
        /^@backstage\/(FrontendPlugin|FrontendModule|FrontendFeatureLoader|BackendFeature)$/.test(
          target,
        )
      )
        return [];
      return targets(target);
    });
  return [];
}

/** Validate archive contents, rather than the source manifest rewritten by prepack. */
export function validateArchive({
  manifest,
  files,
  license,
  expected,
  candidates,
}) {
  assert.equal(manifest.name, expected.name, 'Unexpected package name');
  assert.equal(
    manifest.version,
    expected.version,
    'Unexpected package version',
  );
  assert.equal(
    manifest.private,
    true,
    'Keep the pre-publication private guard',
  );
  assert.equal(manifest.license, 'Apache-2.0');
  assert.equal(typeof manifest.main, 'string', 'Missing runtime entry point');
  assert.equal(
    typeof manifest.types,
    'string',
    'Missing declaration entry point',
  );
  assert.equal(
    license,
    expected.license,
    'Missing or changed repository license',
  );

  for (const file of files) {
    assert(
      file.startsWith('package/') &&
        !file.split('/').includes('..') &&
        !file.includes('\\'),
      `Unsafe archive path: ${file}`,
    );
    assert(
      !/(^|\/)(?:node_modules|\.git)(\/|$)/.test(file) &&
        !/(^|\/)(?:\.env(?:\.[^/]*)?|\.npmrc|\.yarnrc(?:\.yml)?|app-config[^/]*\.ya?ml)$/.test(
          file,
        ),
      `Unintended package content: ${file}`,
    );
  }

  for (const field of ['main', 'module', 'types', 'exports', 'configSchema']) {
    for (const target of targets(manifest[field])) {
      assert(
        !target.includes('*'),
        `Add explicit wildcard validation before exporting ${target}`,
      );
      const relative = target.replace(/^\.\//, '');
      assert(
        !posix.isAbsolute(relative) &&
          !relative.split('/').includes('..') &&
          !relative.includes('\\'),
        `Unsafe ${field} target: ${target}`,
      );
      assert(
        files.includes(`package/${relative}`),
        `Missing ${field}: ${target}`,
      );
    }
  }

  for (const field of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      assert(
        !/^(?:workspace:|file:|link:|portal:|patch:|git|https?:|[./~])/.test(
          range,
        ),
        `Non-registry ${field}: ${name}@${range}`,
      );
      if (name.startsWith('@ansible/')) {
        assert(
          candidates.has(name),
          `Internal dependency outside scope: ${name}`,
        );
      }
    }
  }
}
