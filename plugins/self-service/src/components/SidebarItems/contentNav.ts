export const CONTENT_QUALITY_NAV_PARAM = 'contentNav';
export const CONTENT_QUALITY_NAV_VALUE = 'content-quality';

export function contentQualityNavSearch(): string {
  return `?${CONTENT_QUALITY_NAV_PARAM}=${CONTENT_QUALITY_NAV_VALUE}`;
}

export function isContentQualitySidebarNav(search: string): boolean {
  return (
    new URLSearchParams(search).get(CONTENT_QUALITY_NAV_PARAM) ===
    CONTENT_QUALITY_NAV_VALUE
  );
}

export function repositoriesQualityPath(rootLink: string): string {
  return `${rootLink}/repositories/quality`;
}

export function contentQualitySidebarPath(rootLink: string): string {
  return `${repositoriesQualityPath(rootLink)}${contentQualityNavSearch()}`;
}
