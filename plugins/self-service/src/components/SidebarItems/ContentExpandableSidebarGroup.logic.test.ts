import {
  contentQualityNavSearch,
  isContentQualitySidebarNav,
} from './contentNav';
import {
  isChildActive,
  isPathActive,
} from './ContentExpandableSidebarGroup';

const children = [
  {
    id: 'git-repositories',
    title: 'Git Repositories',
    path: '/self-service/repositories/catalog',
    activePrefixes: ['/self-service/repositories'],
  },
  {
    id: 'content-quality',
    title: 'Content Quality',
    path: '/self-service/repositories/quality',
  },
];

describe('ContentExpandableSidebarGroup active state', () => {
  it('highlights Git Repositories for repository routes without content nav', () => {
    const paths = [
      '/self-service/repositories/catalog',
      '/self-service/repositories/quality',
      '/self-service/repositories/quality-settings',
      '/self-service/repositories/ci-activity',
      '/self-service/repositories/my-repo',
    ];

    for (const path of paths) {
      expect(isChildActive(path, '', children[0], children)).toBe(true);
      expect(isChildActive(path, '', children[1], children)).toBe(false);
    }
  });

  it('highlights Content Quality when content nav search param is present', () => {
    const path = '/self-service/repositories/quality';
    const search = contentQualityNavSearch();

    expect(isContentQualitySidebarNav(search)).toBe(true);
    expect(isChildActive(path, search, children[0], children)).toBe(false);
    expect(isChildActive(path, search, children[1], children)).toBe(true);
  });

  it('does not treat unrelated paths as active', () => {
    expect(
      isPathActive('/self-service/catalog', '/self-service/repositories'),
    ).toBe(false);
    expect(
      isChildActive('/self-service/catalog', '', children[0], children),
    ).toBe(false);
    expect(
      isChildActive('/self-service/catalog', '', children[1], children),
    ).toBe(false);
  });
});
