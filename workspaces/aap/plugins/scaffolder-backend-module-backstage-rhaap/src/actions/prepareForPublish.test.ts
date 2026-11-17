import { prepareForPublishAction as sharedPrepareForPublishAction } from '@ansible/plugin-scaffolder-backend-module-content-development';
import { prepareForPublishAction } from './prepareForPublish';

jest.mock(
  '@ansible/plugin-scaffolder-backend-module-content-development',
  () => ({
    prepareForPublishAction: jest.fn(),
  }),
);

describe('legacy prepareForPublishAction adapter', () => {
  it('re-exports the shared implementation', () => {
    expect(prepareForPublishAction).toBe(sharedPrepareForPublishAction);
  });
});
