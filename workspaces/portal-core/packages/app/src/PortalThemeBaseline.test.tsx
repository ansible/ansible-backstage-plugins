import { screen } from '@testing-library/react';
import { renderTestApp } from '@backstage/frontend-test-utils';
import {
  createFrontendPlugin,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { convertLegacyAppOptions } from '@backstage/core-compat-api';
import { getThemes } from '@red-hat-developer-hub/backstage-plugin-theme';
import portalPlugin from '@ansible/portal-core/alpha';

const page = createFrontendPlugin({
  pluginId: 'theme-test',
  extensions: [
    PageBlueprint.make({
      params: {
        path: '/theme-test',
        loader: async () => <div>Theme baseline test page</div>,
      },
    }),
  ],
});

it.each(['light', 'dark'])(
  'applies the active RHDH %s theme font declarations through the native host',
  async mode => {
    await renderTestApp({
      features: [
        convertLegacyAppOptions({
          themes: getThemes().filter(theme => theme.id === mode),
        }),
        portalPlugin,
        page,
      ],
      initialRouteEntries: ['/theme-test'],
    });
    expect(await screen.findByText('Theme baseline test page')).toBeTruthy();
    const styles = Array.from(document.styleSheets)
      .flatMap(sheet => Array.from(sheet.cssRules).map(rule => rule.cssText))
      .join('\n');
    for (const font of ['RedHatText', 'RedHatDisplay', 'RedHatMono']) {
      expect(styles).toMatch(new RegExp(`@font-face\\s*\\{[^}]*${font}`));
    }
    expect(getComputedStyle(document.body).fontFamily).toContain('RedHatText');
  },
);
