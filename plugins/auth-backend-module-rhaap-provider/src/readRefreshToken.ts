import type { Request } from 'express';

const REFRESH_TOKEN_COOKIE = 'rhaap-refresh-token';

function parseCookieHeader(
  cookieHeader: string | undefined,
): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (name) {
      cookies[name] = decodeURIComponent(value);
    }
  }
  return cookies;
}

function getRequestCookies(req: Request): Record<string, string> {
  const cookies = parseCookieHeader(req.headers?.cookie);
  if (req.cookies) {
    return { ...cookies, ...req.cookies };
  }
  return cookies;
}

function getCookieChunkName(name: string, chunkIndex: number): string {
  return `${name}-${chunkIndex}`;
}

function countExistingCookieChunks(
  cookies: Record<string, string>,
  name: string,
): number {
  for (let chunkNumber = 0; ; chunkNumber++) {
    const key = getCookieChunkName(name, chunkNumber);
    if (!cookies[key]) {
      return chunkNumber;
    }
  }
}

function getChunkedCookie(
  cookies: Record<string, string>,
  name: string,
  chunkCount: number,
): string | undefined {
  const parts: string[] = [];
  for (let chunkNumber = 0; chunkNumber < chunkCount; chunkNumber++) {
    const chunk = cookies[getCookieChunkName(name, chunkNumber)];
    if (typeof chunk !== 'string') {
      return undefined;
    }
    parts.push(chunk);
  }
  return parts.join('');
}

/**
 * Reads the RHAAP OAuth refresh token from request cookies, including chunked cookies.
 * Parses the raw Cookie header so this works on auth module routes that are mounted
 * outside the main auth router's cookie-parser middleware.
 */
export function readRhaapRefreshToken(req: Request): string | undefined {
  const cookies = getRequestCookies(req);
  const chunkCount = countExistingCookieChunks(cookies, REFRESH_TOKEN_COOKIE);
  if (chunkCount > 0) {
    return getChunkedCookie(cookies, REFRESH_TOKEN_COOKIE, chunkCount);
  }
  const value = cookies[REFRESH_TOKEN_COOKIE];
  return typeof value === 'string' ? value : undefined;
}
