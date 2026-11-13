import type {
  HttpRouterService,
  SchedulerService,
} from '@backstage/backend-plugin-api';
import { DefaultSchedulerService } from '@backstage/backend-defaults/scheduler';
import Router from 'express-promise-router';

export const STORE_REFRESH_TASK_ID = 'content-management-store-refresh';
export const DRIFT_POLL_TASK_ID = 'content-management-drift-poll';

/** Mounts scheduler diagnostics and keeps task mutations on the domain API. */
export function createContentScheduler(
  options: Parameters<typeof DefaultSchedulerService.create>[0],
): SchedulerService {
  const httpRouter = options.httpRouter;
  return DefaultSchedulerService.create({
    ...options,
    httpRouter: {
      addAuthPolicy: policy => httpRouter.addAuthPolicy(policy),
      use: handler => {
        const router = Router();
        router.post(
          [
            '/.backstage/scheduler/v1/tasks/:id/trigger',
            '/.backstage/scheduler/v1/tasks/:id/cancel',
          ],
          (_req, res) => {
            res.status(404).end();
          },
        );
        // The host and plugin use distinct Express declaration majors. Both
        // mounts pass the same request, response and next handler at runtime.
        httpRouter.use(
          router as unknown as Parameters<HttpRouterService['use']>[0],
        );
        httpRouter.use(handler);
      },
    },
  });
}
