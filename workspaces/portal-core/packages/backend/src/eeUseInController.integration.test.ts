/** @jest-environment node */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import request from 'supertest';
import { parse } from 'yaml';
import catalog from '@backstage/plugin-catalog-backend';
import templateModel from '@backstage/plugin-catalog-backend-module-scaffolder-entity-model';
import scaffolder from '@backstage/plugin-scaffolder-backend';
import ansible from '@ansible/plugin-scaffolder-backend-module-backstage-rhaap';

describe('shipped Use in Controller workflow', () => {
  it.each(['development', 'production'] as const)(
    'resolves the shipped catalog template and executes its registered AAP action in %s',
    async mode => {
      const root = resolve(__dirname, '../../../../..');
      const defaults = parse(
        await readFile(resolve(root, 'app-config.yaml'), 'utf8'),
      );
      const production = parse(
        await readFile(resolve(root, 'app-config.production.yaml'), 'utf8'),
      );
      const originalCwd = process.cwd();
      let backend: Awaited<ReturnType<typeof startTestBackend>> | undefined;
      const received: Array<{ authorization?: string; body: unknown }> = [];
      // Only the external Controller HTTP boundary is replaced.
      const controller = createServer(async (req, res) => {
        res.setHeader('content-type', 'application/json');
        if (req.method === 'POST') {
          let body = '';
          for await (const chunk of req) body += chunk;
          received.push({
            authorization: req.headers.authorization,
            body: JSON.parse(body),
          });
          res.end(JSON.stringify({ id: 42 }));
        } else {
          res.end(JSON.stringify({ count: 0, results: [] }));
        }
      });
      await new Promise<void>(done => controller.listen(0, '127.0.0.1', done));
      const port = (controller.address() as AddressInfo).port;
      try {
        // Match the real startup working directories. File locations must stay
        // relative and unchanged so broken shipped paths cannot pass this test.
        process.chdir(mode === 'development' ? resolve(__dirname, '..') : root);
        backend = await startTestBackend({
          features: [
            catalog,
            templateModel,
            scaffolder,
            ansible,
            mockServices.rootConfig.factory({
              data: {
                app: { baseUrl: 'http://localhost:3000' },
                backend: { baseUrl: 'http://localhost:7007' },
                // Production overrides the default location list, just as the
                // deployed backend's two config files do. Disable external providers.
                catalog: {
                  ...defaults.catalog,
                  ...(mode === 'production' ? production.catalog : {}),
                  providers: {},
                },
                ansible: {
                  rhaap: {
                    baseUrl: `http://127.0.0.1:${port}`,
                    token: 'service-token',
                    checkSSL: false,
                  },
                },
              },
            }),
          ],
        });
        const { server } = backend;
        let entity;
        for (let attempt = 0; attempt < 100; attempt++) {
          entity = await request(server).get(
            '/api/catalog/entities/by-name/template/default/ee-use-in-controller',
          );
          if (entity.status === 200) break;
          await delay(100);
        }
        expect(entity?.status).toBe(200);
        expect(entity?.body.spec.steps[0].action).toBe(
          'rhaap:create-execution-environment',
        );
        const submitted = await request(server)
          .post('/api/scaffolder/v2/tasks')
          .send({
            templateRef: 'template:default/ee-use-in-controller',
            values: {
              environmentName: 'Reviewed EE',
              environmentDescription: 'Selected image',
              organizationId: 7,
              organizationName: 'Platform',
              image: 'registry.example/team/ee:latest',
              pull: 'always',
            },
            secrets: { aapToken: 'caller-token' },
          });
        expect(submitted.status).toBe(201);
        let task;
        for (let attempt = 0; attempt < 100; attempt++) {
          task = await request(server).get(
            `/api/scaffolder/v2/tasks/${submitted.body.id}`,
          );
          if (['completed', 'failed'].includes(task.body.status)) break;
          await delay(100);
        }
        if (task?.body.status !== 'completed') {
          const events = await request(server).get(
            `/api/scaffolder/v2/tasks/${submitted.body.id}/events`,
          );
          throw new Error(JSON.stringify(events.body));
        }
        expect(received).toEqual([
          {
            authorization: 'Bearer caller-token',
            body: {
              name: 'Reviewed EE',
              description: 'Selected image',
              organization: 7,
              image: 'registry.example/team/ee:latest',
              pull: 'always',
            },
          },
        ]);
      } finally {
        try {
          await backend?.stop();
        } finally {
          process.chdir(originalCwd);
          controller.closeAllConnections();
          await new Promise<void>(done => controller.close(() => done()));
        }
      }
    },
    60_000,
  );
});
