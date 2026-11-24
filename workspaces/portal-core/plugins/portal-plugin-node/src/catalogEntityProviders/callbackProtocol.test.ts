import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

it('does not crash Node when a provider ignores a rejected callback promise', () => {
  // Run actual SDK source outside Jest: Jest's rejection hooks can hide the
  // extra unobserved Promise created by an async wrapper around the callback.
  const source = resolve(__dirname, 'registry.ts');
  const script = `
    const ts = require(${JSON.stringify(require.resolve('typescript'))});
    const fs = require('node:fs');
    require.extensions['.ts'] = (module, filename) => {
      const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      module._compile(output, filename);
    };
    const { PortalCatalogEntityProviders } = require(${JSON.stringify(source)});
    const providers = new PortalCatalogEntityProviders();
    providers.register({
      id: 'invalid.ignores',
      provider: {
        isReady: () => true,
        async withEntityMutation(_input, callback) {
          callback({
            assertLockHeld() {},
            registrationState: 'none',
            async upsert() {}, async remove() {}, async clearRegistration() {},
          });
        },
      },
    });
    (async () => {
      try {
        await providers.get('invalid.ignores').withEntityMutation(
          { entityRef: 'component:default/example' },
          async () => { throw new Error('Authorization denied'); },
        );
        process.exitCode = 2;
      } catch (error) {
        if (error.message !== 'Authorization denied') throw error;
        console.log('denial preserved');
      }
      setTimeout(() => console.log('process survived'), 20);
    })().catch(error => { console.error(error); process.exitCode = 3; });
  `;
  const result = spawnSync(
    process.execPath,
    ['--unhandled-rejections=strict', '-e', script],
    {
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, NODE_OPTIONS: '' },
    },
  );
  expect(result.error).toBeUndefined();
  expect({ status: result.status, stderr: result.stderr }).toEqual({
    status: 0,
    stderr: '',
  });
  expect(result.stdout).toContain('denial preserved');
  expect(result.stdout).toContain('process survived');
});
