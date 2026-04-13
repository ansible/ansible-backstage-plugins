import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { IAAPService } from '@ansible/backstage-rhaap-common';
import {
  parseAapActionValues,
  rethrowPreservingInputError,
} from './utils/parseAapActionValues';
import { normalizeExecutionEnvironmentInputValues } from './schemas/rhaapActionPayloadUtils';
import {
  aapActionInputValuesLooseSchema,
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
        values: () => aapActionInputValuesLooseSchema,
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
      let eeData;
      try {
        const normalized = normalizeExecutionEnvironmentInputValues(
          input.values,
        );
        const parsedData = parseAapActionValues(
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
