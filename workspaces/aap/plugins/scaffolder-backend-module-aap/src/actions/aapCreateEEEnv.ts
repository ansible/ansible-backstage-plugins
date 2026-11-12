import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import {
  type ExecutionEnvironment,
  IAAPService,
} from '@ansible/backstage-rhaap-common';
import {
  parseAapActionValues,
  rethrowPreservingInputError,
} from './utils/parseAapActionValues';
import { normalizeExecutionEnvironmentInputValues } from './schemas/rhaapActionPayloadUtils';
import { executionEnvironmentInputSchema } from './schemas/rhaapActionSchemas';

export const createExecutionEnvironment = (ansibleServiceRef: IAAPService) => {
  return createTemplateAction({
    id: 'rhaap:create-execution-environment',
    schema: {
      input: {
        token: z => z.string({ description: 'Oauth2 token' }),
        deleteIfExist: z =>
          z.boolean({
            description: 'Delete execution environment if it exists',
          }),
        values: z => z.record(z.string(), z.unknown()),
      },
      output: {
        executionEnvironment: z => z.record(z.string(), z.unknown()),
      },
    },
    async handler(ctx) {
      const { input, logger } = ctx;
      const token = input.token;
      if (!token?.length) {
        const error = new Error('Authorization token not provided.');
        error.stack = '';
        throw error;
      }

      ansibleServiceRef.setLogger(logger);
      let eeData;
      try {
        const normalized = normalizeExecutionEnvironmentInputValues(
          input.values,
        );
        const parsedData: ExecutionEnvironment = parseAapActionValues(
          executionEnvironmentInputSchema,
          normalized,
          'rhaap:create-execution-environment',
        );
        eeData = await ansibleServiceRef.createExecutionEnvironment(
          parsedData,
          input.token,
          input.deleteIfExist,
        );
      } catch (e: unknown) {
        rethrowPreservingInputError(e);
      }
      ctx.output('executionEnvironment', eeData);
    },
  });
};
