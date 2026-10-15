import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('../src'));

backend.start().catch(error => {
  process.stderr.write(
    `Failed to start the development backend: ${String(error)}\n`,
  );
  process.exitCode = 1;
});
