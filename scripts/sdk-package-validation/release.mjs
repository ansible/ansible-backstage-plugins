import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const registry = 'https://registry.npmjs.org/';
export const repository = 'ansible/ansible-backstage-plugins';

/** Match the protected environment's branch rules, never tags or nested branches. */
export function validateReleaseRef(ref) {
  assert.equal(typeof ref, 'string', 'Release branch ref required');
  assert.match(
    ref,
    /^refs\/heads\/(?:main|release-[^/]+)$/,
    'Release requires main or a release-* branch without slashes',
  );
  return ref;
}

/** Require an explicitly reviewed, coordinated developer-preview release. */
export function validateReleaseManifests(packages, version) {
  assert.match(
    version ?? '',
    /^0\.(0|[1-9]\d*)\.(0|[1-9]\d*)-alpha\.(0|[1-9]\d*)$/,
    'Expected a 0.y.z-alpha.N preview version',
  );
  const names = new Set(packages.map(p => p.name));
  assert.equal(names.size, packages.length, 'Duplicate release package');
  for (const manifest of packages) {
    assert(
      Object.keys(manifest.publishConfig ?? {}).every(key =>
        ['access', 'registry', 'provenance', 'main', 'types'].includes(key),
      ),
      'Unexpected publishConfig override',
    );
    assert.match(manifest.name, /^@ansible\/[a-z0-9-]+$/);
    assert.equal(
      manifest.version,
      version,
      `${manifest.name}: release version mismatch`,
    );
    assert.equal(
      manifest.private,
      false,
      `${manifest.name}: release requires reviewed private: false metadata`,
    );
    assert.equal(
      manifest.publishConfig?.access,
      'public',
      `${manifest.name}: public access required`,
    );
    assert(
      !manifest.publishConfig.registry ||
        manifest.publishConfig.registry === registry,
      'Unexpected publication registry',
    );
    assert.notEqual(
      manifest.publishConfig.provenance,
      false,
      'Provenance must stay enabled',
    );
    assert.equal(
      manifest.repository?.url,
      `https://github.com/${repository}.git`,
    );
    for (const section of [
      'dependencies',
      'optionalDependencies',
      'peerDependencies',
    ]) {
      for (const [name, range] of Object.entries(manifest[section] ?? {})) {
        assert(
          typeof range !== 'string' || !range.startsWith('npm:@ansible/'),
          `${manifest.name}: npm aliases to @ansible packages are not supported`,
        );
        if (!name.startsWith('@ansible/')) continue;
        assert(names.has(name), `Internal dependency outside release: ${name}`);
        assert(
          [
            'workspace:^',
            'workspace:*',
            'workspace:~',
            version,
            `^${version}`,
            `~${version}`,
          ].includes(range),
          `${manifest.name}: incompatible release dependency ${name}@${range}`,
        );
      }
    }
  }
}

export function publicationOrder(packages) {
  const byName = new Map(packages.map(p => [p.name, p]));
  const ordered = [];
  const visiting = new Set();
  const visited = new Set();
  function visit(manifest) {
    if (visited.has(manifest.name)) return;
    assert(!visiting.has(manifest.name), 'Cyclic release dependencies');
    visiting.add(manifest.name);
    for (const name of Object.keys({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    })) {
      if (byName.has(name)) visit(byName.get(name));
    }
    visiting.delete(manifest.name);
    visited.add(manifest.name);
    ordered.push(manifest);
  }
  packages.forEach(visit);
  return ordered;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  validateReleaseRef(process.env.GITHUB_REF);
  const paths = JSON.parse(
    readFileSync(new URL('packages.json', import.meta.url), 'utf8'),
  );
  const packages = paths.map(path =>
    JSON.parse(
      readFileSync(
        new URL(`../../${path}/package.json`, import.meta.url),
        'utf8',
      ),
    ),
  );
  validateReleaseManifests(packages, process.env.SDK_RELEASE_VERSION);
  console.log(`Release metadata verified for ${packages.length} candidates`);
}
