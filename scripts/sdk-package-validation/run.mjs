import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  closeSync,
  openSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateArchive } from './validate-archive.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = realpathSync(resolve(here, '../..'));
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const rootManifest = readJson(join(repo, 'package.json'));
const paths = readJson(join(here, 'packages.json'));
const packages = paths.map(path => ({
  path,
  manifest: readJson(join(repo, path, 'package.json')),
}));
const candidates = new Set(packages.map(p => p.manifest.name));
const output = process.env.SDK_VALIDATION_DIR
  ? resolve(process.env.SDK_VALIDATION_DIR)
  : mkdtempSync(join(tmpdir(), 'portal-sdk-validation-'));
mkdirSync(output, { recursive: true });
const outside = relative(repo, realpathSync(output));
assert(
  outside === '..' || outside.startsWith('../') || isAbsolute(outside),
  'Output must be outside the repository',
);
assert(
  !existsSync(join(output, 'consumer')),
  'Use a fresh output directory for each run',
);
for (const directory of ['artifacts', 'logs'])
  mkdirSync(join(output, directory));
const consumer = join(output, 'consumer');
console.log(`SDK validation output: ${output}`);

async function run(command, args, cwd, label) {
  const log = join(output, 'logs', `${label}.log`);
  console.log(label);
  // No shell interpolation. Child output stays in logs, including verbose installs.
  const fd = openSync(log, 'w');
  try {
    await new Promise((resolveRun, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: { ...process.env, NODE_PATH: '' },
        stdio: ['ignore', fd, fd],
      });
      child.on('error', reject);
      child.on('close', code => {
        if (code === 0) resolveRun();
        else reject(new Error(`${label} failed (${code}); see ${log}`));
      });
    });
  } finally {
    closeSync(fd);
  }
  return readFileSync(log, 'utf8');
}

async function main() {
  await run('yarn', ['tsc'], repo, 'declarations');
  const manifests = [];
  for (const { path, manifest } of packages) {
    const name = manifest.name.split('/')[1];
    const source = join(repo, path, 'package.json');
    const before = readFileSync(source, 'utf8');
    const archive = join(output, 'artifacts', `${name}.tgz`);
    await run(
      'yarn',
      ['workspace', manifest.name, 'build'],
      repo,
      `build-${name}`,
    );
    await run(
      'yarn',
      ['workspace', manifest.name, 'pack', '--out', archive],
      repo,
      `pack-${name}`,
    );
    assert.equal(
      readFileSync(source, 'utf8'),
      before,
      `Prepack did not restore ${source}`,
    );
    const packed = JSON.parse(
      await run(
        'tar',
        ['-xOf', archive, 'package/package.json'],
        repo,
        `manifest-${name}`,
      ),
    );
    const files = (await run('tar', ['-tzf', archive], repo, `files-${name}`))
      .trim()
      .split('\n');
    const license = await run(
      'tar',
      ['-xOf', archive, 'package/LICENSE'],
      repo,
      `license-${name}`,
    );
    validateArchive({
      manifest: packed,
      files,
      license,
      expected: {
        ...manifest,
        license: readFileSync(join(repo, 'LICENSE'), 'utf8'),
      },
      candidates,
    });
    manifests.push(packed);
  }

  cpSync(join(here, 'consumer'), consumer, { recursive: true });
  const fixture = readJson(join(consumer, 'package.json'));
  fixture.packageManager = rootManifest.packageManager;
  fixture.resolutions = {
    '@backstage/core-app-api':
      rootManifest.resolutions['@backstage/core-app-api'],
  };
  for (const manifest of manifests) {
    const archive = `file:../artifacts/${manifest.name.split('/')[1]}.tgz`;
    fixture.dependencies[manifest.name] = archive;
    fixture.resolutions[manifest.name] = archive;
    for (const name of Object.keys(manifest.peerDependencies ?? {})) {
      assert(
        candidates.has(name) || fixture.dependencies[name],
        `Missing explicit consumer peer: ${name}`,
      );
    }
  }
  writeFileSync(
    join(consumer, 'package.json'),
    `${JSON.stringify(fixture, null, 2)}\n`,
  );
  writeFileSync(
    join(consumer, '.yarnrc.yml'),
    'nodeLinker: node-modules\nenableScripts: false\n',
  );
  await run(
    'yarn',
    ['install', '--no-immutable'],
    consumer,
    'consumer-install',
  );
  await run('yarn', ['tsc'], consumer, 'consumer-types');
  await run('yarn', ['node', 'verify.mjs'], consumer, 'consumer-runtime');
  const commit = (
    await run('git', ['rev-parse', 'HEAD'], repo, 'revision')
  ).trim();
  writeFileSync(
    join(output, 'report.json'),
    `${JSON.stringify(
      {
        commit,
        includesUncommittedChanges: Boolean(
          (
            await run(
              'git',
              ['status', '--porcelain', '--untracked-files=no'],
              repo,
              'working-tree',
            )
          ).trim(),
        ),
        node: process.version,
        packages: manifests.map(p => ({
          name: p.name,
          version: p.version,
          sha256: createHash('sha256')
            .update(
              readFileSync(
                join(output, 'artifacts', `${p.name.split('/')[1]}.tgz`),
              ),
            )
            .digest('hex'),
        })),
        checks: [
          'archive contents and metadata',
          'isolated install',
          'consumer TypeScript',
          'frontend bundles',
          'backend health smoke',
        ],
        limitations: [
          'No live RHDH discovery or OAuth test',
          'No dependency vulnerability or secret-content scan',
          'Consumer install scripts disabled',
          'Consumer skipLibCheck enabled',
          'External dependency lockfile generated per run',
        ],
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `All ${packages.length} SDK candidates passed. Report: ${join(
      output,
      'report.json',
    )}`,
  );
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
