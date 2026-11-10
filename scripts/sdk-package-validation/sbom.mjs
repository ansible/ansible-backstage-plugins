import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function verifyArchiveDigest(directory, candidate) {
  assert(
    /^@ansible\/[a-z0-9-]+$/.test(candidate.name),
    'Invalid candidate name',
  );
  const archive = join(
    directory,
    'artifacts',
    `${candidate.name.split('/')[1]}.tgz`,
  );
  const digest = createHash('sha256')
    .update(readFileSync(archive))
    .digest('hex');
  assert.equal(
    digest,
    candidate.sha256,
    `${candidate.name}: archive changed after validation`,
  );
  return archive;
}

/** Only unpack regular files/directories inside package/, never links or devices. */
export function verifyArchiveEntries(paths, details) {
  for (const path of paths.trim().split('\n')) {
    assert(
      path.startsWith('package/') &&
        !path.split('/').includes('..') &&
        !path.includes('\\'),
      `Unsafe SBOM archive path: ${path}`,
    );
  }
  for (const line of details.trim().split('\n')) {
    assert(
      /^[d-]/.test(line),
      'SBOM extraction rejects links and special files',
    );
  }
}

export function verifySbom(document, candidate) {
  assert.equal(document.spdxVersion, 'SPDX-2.3');
  assert(
    document.packages?.some(
      p =>
        p.name === candidate.name &&
        p.versionInfo === candidate.version &&
        p.externalRefs?.some(
          ref =>
            ref.referenceType === 'purl' &&
            ref.referenceLocator.startsWith('pkg:npm/'),
        ),
    ),
    `${candidate.name}: SBOM does not describe the packed npm package`,
  );
}

export function generateSboms(directory, syft = 'syft') {
  const report = JSON.parse(
    readFileSync(join(directory, 'report.json'), 'utf8'),
  );
  const output = join(directory, 'sboms');
  mkdirSync(output, { recursive: true });
  const index = [];
  for (const candidate of report.packages) {
    const archive = verifyArchiveDigest(directory, candidate);
    verifyArchiveEntries(
      execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }),
      execFileSync('tar', ['-tvzf', archive], { encoding: 'utf8' }),
    );
    const staging = mkdtempSync(join(tmpdir(), 'portal-sdk-sbom-'));
    const name = `${candidate.name.split('/')[1]}.spdx.json`;
    const sbom = join(output, name);
    try {
      execFileSync('tar', ['-xzf', archive, '--no-same-owner', '-C', staging]);
      execFileSync(
        syft,
        [
          'scan',
          `dir:${join(staging, 'package')}`,
          '--select-catalogers',
          '+javascript-package-cataloger',
          '--source-name',
          candidate.name,
          '--source-version',
          candidate.version,
          '-o',
          `spdx-json=${sbom}`,
        ],
        {
          stdio: 'inherit',
          env: {
            ...process.env,
            SYFT_CHECK_FOR_APP_UPDATE: 'false',
            SYFT_JAVASCRIPT_SEARCH_REMOTE_LICENSES: 'false',
          },
        },
      );
      const document = JSON.parse(readFileSync(sbom, 'utf8'));
      verifySbom(document, candidate);
      index.push({
        name: candidate.name,
        version: candidate.version,
        archiveSha256: candidate.sha256,
        sbom: name,
        sbomSha256: createHash('sha256')
          .update(readFileSync(sbom))
          .digest('hex'),
      });
      console.log(`Generated SBOM: ${candidate.name}`);
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  }
  writeFileSync(
    join(output, 'index.json'),
    `${JSON.stringify(index, null, 2)}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    assert(
      process.env.SDK_VALIDATION_DIR,
      'Set SDK_VALIDATION_DIR to a completed validation directory',
    );
    generateSboms(
      resolve(process.env.SDK_VALIDATION_DIR),
      process.env.SYFT_CMD,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
