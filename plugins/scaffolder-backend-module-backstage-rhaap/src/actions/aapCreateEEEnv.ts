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
import {
  launchJobTemplateValuesLooseSchema,
  aapApiRecordOutputSchema,
  executionEnvironmentInputSchema,
} from './schemas/rhaapActionSchemas';

export const createExecutionEnvironment = (ansibleServiceRef: IAAPService) => {
  return createTemplateAction({
    id: 'rhaap:create-execution-environment',
    schema: {
      input: {
        token: z => z.string({ description: 'Oauth2 token' }),
        deleteIfExist: z =>
          z.boolean({ description: 'Delete project if exist' }),
        values: () => launchJobTemplateValuesLooseSchema,
      },
      output: {
        executionEnvironment: () => aapApiRecordOutputSchema,
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
      const normalized = normalizeExecutionEnvironmentInputValues(input.values);
      let parsedData: ExecutionEnvironment;
      try {
        parsedData = parseAapActionValues(
          executionEnvironmentInputSchema,
          normalized,
          'rhaap:create-execution-environment',
        );
      } catch (e: unknown) {
        rethrowPreservingInputError(e);
      }
      const eeData = await ansibleServiceRef.createExecutionEnvironment(
        parsedData,
        input.token,
        input.deleteIfExist,
      );
      ctx.output('executionEnvironment', eeData);
    },
  });
};
