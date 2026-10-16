import { createDevApp } from '@backstage/dev-utils';
import { AapAuthApi, rhAapAuthApiRef } from '@ansible/aap-app-auth';
import { AAPApis } from './apis';
import { SelfServicePage, selfServicePlugin } from './plugin';

jest.mock('@backstage/dev-utils', () => ({ createDevApp: jest.fn() }));

it('registers the independent AAP auth factory in the standalone development app', async () => {
  const builder = {
    registerApi: jest.fn().mockReturnThis(),
    registerPlugin: jest.fn().mockReturnThis(),
    addPage: jest.fn().mockReturnThis(),
    render: jest.fn(),
  };
  jest
    .mocked(createDevApp)
    .mockReturnValue(builder as unknown as ReturnType<typeof createDevApp>);

  await import('../dev');

  expect(builder.registerApi).toHaveBeenCalledTimes(1);
  expect(builder.registerApi).toHaveBeenCalledWith(AapAuthApi);
  expect(AapAuthApi.api).toBe(rhAapAuthApiRef);
  expect(AAPApis.deps.rhaapAuthApi).toBe(rhAapAuthApiRef);
  expect(builder.registerPlugin).toHaveBeenCalledWith(selfServicePlugin);
  expect(builder.addPage).toHaveBeenCalledWith({
    element: <SelfServicePage />,
    title: 'Root Page',
    path: '/self-service',
  });
  expect(builder.render).toHaveBeenCalledTimes(1);
});
