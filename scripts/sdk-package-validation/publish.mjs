import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateArchive } from './validate-archive.mjs';
import { verifyArchiveDigest, verifySbom } from './sbom.mjs';
import {
  publicationOrder,
  registry,
  repository,
  validateReleaseManifests,
} from './release.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const directory = resolve(process.env.SDK_VALIDATION_DIR);
const version = process.env.SDK_RELEASE_VERSION;
const execute = process.argv.includes('--publish');
assert(
  process.argv.slice(2).every(arg => arg === '--publish'),
  'Unknown argument',
);
const paths = readJson(
  join(repo, 'scripts/sdk-package-validation/packages.json'),
);
const sources = paths.map(path => readJson(join(repo, path, 'package.json')));
validateReleaseManifests(sources, version);
const report = readJson(join(directory, 'report.json'));
assert.equal(
  report.commit,
  process.env.GITHUB_SHA,
  'Artifact source revision mismatch',
);
assert.equal(
  report.includesUncommittedChanges,
  false,
  'Artifacts must come from a clean release commit',
);
assert.equal(report.packages.length, sources.length, 'Incomplete artifact set');
assert.deepEqual(
  new Set(report.packages.map(p => p.name)),
  new Set(sources.map(p => p.name)),
  'Artifact allowlist mismatch',
);
const index = readJson(join(directory, 'sboms/index.json'));
assert.equal(index.length, sources.length, 'Incomplete SBOM set');
const manifests = [];
for (const source of sources) {
  const candidate = report.packages.find(p => p.name === source.name);
  assert.equal(candidate.version, version);
  const archive = verifyArchiveDigest(directory, candidate);
  const manifest = JSON.parse(
    execFileSync('tar', ['-xOf', archive, 'package/package.json'], {
      encoding: 'utf8',
    }),
  );
  for (const field of ['main', 'types']) {
    assert(
      !manifest.publishConfig?.[field] ||
        manifest.publishConfig[field] === manifest[field],
      `Packed publishConfig.${field} differs from validated entry point`,
    );
  }
  validateArchive({
    manifest,
    expected: {
      ...source,
      license: readFileSync(join(repo, 'LICENSE'), 'utf8'),
    },
    files: execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
      .trim()
      .split('\n'),
    license: execFileSync('tar', ['-xOf', archive, 'package/LICENSE'], {
      encoding: 'utf8',
    }),
    candidates: new Set(sources.map(p => p.name)),
  });
  const sbomName = `${source.name.split('/')[1]}.spdx.json`;
  const sbom = readFileSync(join(directory, 'sboms', sbomName));
  const entry = index.find(p => p.name === source.name);
  assert(
    entry && entry.version === version && entry.sbom === sbomName,
    'SBOM index mismatch',
  );
  assert.equal(entry.archiveSha256, candidate.sha256);
  assert.equal(
    entry.sbomSha256,
    createHash('sha256').update(sbom).digest('hex'),
  );
  verifySbom(JSON.parse(sbom), candidate);
  manifests.push(manifest);
}
validateReleaseManifests(manifests, version);
const ordered = publicationOrder(manifests);
console.log(`Verified ${ordered.length} archives for ${version} under next`);

if (execute) {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(process.env.GITHUB_REPOSITORY, repository);
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
  assert(
    process.env.ACTIONS_ID_TOKEN_REQUEST_URL &&
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
    'OIDC credentials required',
  );
  for (const key of Object.keys(process.env)) {
    assert(
      !/^(?:NODE_AUTH_TOKEN|NPM_TOKEN)$/i.test(key) &&
        !/^npm_config_(?:.*auth.*|.*token.*|provenance_file)$/i.test(key),
      'Static npm authentication or provenance override is forbidden',
    );
  }
  // Verify every name is already bootstrapped before making the first registry write.
  for (const manifest of ordered) {
    const response = await fetch(
      `${registry}${encodeURIComponent(manifest.name)}`,
    );
    assert.equal(
      response.status,
      200,
      `${manifest.name}: package must already exist with its trusted publisher configured`,
    );
    const metadata = await response.json();
    assert(
      !metadata.versions?.[version],
      `${manifest.name}@${version} already exists. Review any partial release before retrying.`,
    );
  }
  for (const manifest of ordered) {
    const archive = verifyArchiveDigest(
      directory,
      report.packages.find(p => p.name === manifest.name),
    );
    execFileSync(
      'npm',
      [
        'publish',
        archive,
        '--registry',
        registry,
        '--access',
        'public',
        '--tag',
        'next',
        '--provenance',
        '--ignore-scripts',
      ],
      { stdio: 'inherit' },
    );
  }
}
