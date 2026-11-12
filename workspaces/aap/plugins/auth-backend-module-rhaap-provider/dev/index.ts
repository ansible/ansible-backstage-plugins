import { createBackend } from '@backstage/backend-defaults';
import { ansibleServiceFactory } from '@ansible/backstage-rhaap-common';

const backend = createBackend();

backend.add(ansibleServiceFactory);
backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('../src'));

backend.start().catch(() => {
  process.stderr.write('Failed to start the development backend.\n');
  process.exitCode = 1;
});
