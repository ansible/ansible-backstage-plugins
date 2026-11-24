import { createDevApp } from '@backstage/dev-utils';
import { AapAuthApi } from '@ansible/aap-app-auth';
import { selfServicePlugin, SelfServicePage } from '../src/plugin';

createDevApp()
  .registerApi(AapAuthApi)
  .registerPlugin(selfServicePlugin)
  .addPage({
    element: <SelfServicePage />,
    title: 'Root Page',
    path: '/self-service',
  })
  .render();
