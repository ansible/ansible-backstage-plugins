/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Request, Response } from 'express';
import type { LoggerService } from '@backstage/backend-plugin-api';
import { getApmeConfig } from '@ansible/backstage-apme-common';
import type { Config } from '@backstage/config';

/**
 * Transparent proxy of `/apme/projects/:projectId/operation*` to Gateway
 * `/api/v1/projects/:projectId/operation*` for `@apme/ui-workflow`.
 *
 * Injects `scm_token` into JSON bodies when the portal resolved one, so
 * Gateway can own commit/push (ADR-056). Never forwards `file_overrides`.
 */
export async function proxyProjectOperation(options: {
  req: Request;
  res: Response;
  rootConfig: Config;
  logger: LoggerService;
  projectId: string;
  /** Path after `/operation` (e.g. ``, `/approve`, `/events`). */
  operationSuffix: string;
  scmToken?: string;
}): Promise<void> {
  const { req, res, rootConfig, logger, projectId, operationSuffix, scmToken } =
    options;
  const { baseUrl } = getApmeConfig(rootConfig);
  const targetPath = `/api/v1/projects/${encodeURIComponent(
    projectId,
  )}/operation${operationSuffix}`;
  const qs =
    req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const targetUrl = `${baseUrl.replace(/\/$/, '')}${targetPath}${qs}`;

  const headers: Record<string, string> = {
    Accept: req.headers.accept?.toString() || 'application/json',
  };
  if (req.headers['content-type']) {
    headers['Content-Type'] = String(req.headers['content-type']);
  }
  if (scmToken) {
    headers['X-SCM-Token'] = scmToken;
  }

  let body: string | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const incoming =
      req.body && typeof req.body === 'object' ? { ...req.body } : req.body;
    if (incoming && typeof incoming === 'object') {
      delete (incoming as { file_overrides?: unknown }).file_overrides;
      if (scmToken && !(incoming as { scm_token?: string }).scm_token) {
        (incoming as { scm_token?: string }).scm_token = scmToken;
      }
      body = JSON.stringify(incoming);
      headers['Content-Type'] = 'application/json';
    } else if (typeof incoming === 'string') {
      body = incoming;
    }
  }

  logger.debug(`APME operation proxy ${req.method} ${targetUrl}`);

  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers,
    body,
  });

  res.status(upstream.status);
  const contentType = upstream.headers.get('content-type');
  if (contentType) {
    res.setHeader('Content-Type', contentType);
  }

  // SSE / streaming
  if (contentType?.includes('text/event-stream')) {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (!upstream.body) {
      res.end();
      return;
    }
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
    } finally {
      res.end();
    }
    return;
  }

  const text = await upstream.text();
  res.send(text);
}
