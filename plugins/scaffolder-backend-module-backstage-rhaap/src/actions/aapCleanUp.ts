import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { CleanUp, IAAPService } from '@ansible/backstage-rhaap-common';
import {
  parseAapActionValues,
  rethrowPreservingInputError,
} from './utils/parseAapActionValues';
import { normalizeCleanUpValues } from './schemas/rhaapActionPayloadUtils';
import {
  launchJobTemplateValuesLooseSchema,
  cleanUpInputSchema,
} from './schemas/rhaapActionSchemas';

export const cleanUp = (ansibleServiceRef: IAAPService) => {
  return createTemplateAction({
    id: 'rhaap:clean-up',
    schema: {
      input: {
        token: z => z.string({ description: 'Oauth2 token' }),
        values: () => launchJobTemplateValuesLooseSchema,
      },
      output: {
        cleanUp: z => z.string(),
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
      try {
        const normalized = normalizeCleanUpValues(input.values);
        const parsedData = parseAapActionValues(
          cleanUpInputSchema,
          normalized,
          'rhaap:clean-up',
        );
        await ansibleServiceRef.cleanUp(parsedData as CleanUp, input.token);
      } catch (e: unknown) {
        rethrowPreservingInputError(e);
      }

      ctx.output('cleanUp', 'Successfully removed data from RH AAP.');
    },
  });
};
