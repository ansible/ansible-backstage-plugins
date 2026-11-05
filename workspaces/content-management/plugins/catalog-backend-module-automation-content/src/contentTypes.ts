import { ContentTypeRegistry } from '@ansible/automation-content-common';
import { ExecutionEnvironmentAdapter } from '@ansible/content-type-execution-environment';

/**
 * The content types this deployment recognises.
 *
 * This is the composition root for the semantics axis, and it is the *only* place that
 * names a content type. Adding one is an import and a `.register()` call here, against
 * a package that lives on its own — no change to the OCI client, the entity provider,
 * the content index, the API or the UI.
 *
 * That is the whole extensibility claim, and it is checked by a test rather than
 * asserted: `contentTypes.test.ts` registers a type defined entirely within the test
 * file and follows it through discovery to a catalog entity.
 */
export function defaultContentTypes(): ContentTypeRegistry {
  return new ContentTypeRegistry().register(new ExecutionEnvironmentAdapter());
}
