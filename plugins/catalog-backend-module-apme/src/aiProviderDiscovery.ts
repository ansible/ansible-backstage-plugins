/*
 * Copyright Red Hat
 */

import type { DiscoveredAiModel } from '@ansible/backstage-apme-common/types';

function normalizeBaseUrl(baseUrl: string | undefined, fallback: string): string {
  const raw = (baseUrl?.trim() || fallback).replace(/\/$/, '');
  return raw;
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Provider discovery failed (${response.status}): ${body || response.statusText}`,
    );
  }
  return response.json();
}

async function discoverOllamaModels(
  baseUrl: string | undefined,
): Promise<DiscoveredAiModel[]> {
  const root = normalizeBaseUrl(baseUrl, 'http://host.containers.internal:11434');
  const data = (await fetchJson(`${root}/api/tags`)) as {
    models?: Array<{ name?: string; model?: string }>;
  };
  return (data.models ?? []).map(entry => {
    const id = entry.name ?? entry.model ?? '';
    return {
      id,
      name: id,
      provider: 'ollama',
      engine: 'ollama',
    };
  });
}

async function discoverOpenAiCompatibleModels(
  engine: string,
  baseUrl: string,
  apiKey?: string,
): Promise<DiscoveredAiModel[]> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }
  const data = (await fetchJson(`${baseUrl.replace(/\/$/, '')}/models`, {
    headers,
  })) as { data?: Array<{ id?: string }> };
  return (data.data ?? [])
    .filter(row => row.id)
    .map(row => ({
      id: row.id as string,
      name: row.id as string,
      provider: engine,
      engine,
    }));
}

/** Discover models from a provider engine (portal fallback when Gateway API is absent). */
export async function discoverAiModelsForEngine(input: {
  engine: string;
  api_key?: string;
  base_url?: string;
}): Promise<DiscoveredAiModel[]> {
  const engine = input.engine.trim();
  if (!engine) {
    throw new Error('engine is required');
  }

  if (engine === 'ollama') {
    return discoverOllamaModels(input.base_url);
  }

  const defaultUrls: Record<string, string> = {
    openrouter: 'https://openrouter.ai/api/v1',
    openai: 'https://api.openai.com/v1',
    vllm: 'http://host.containers.internal:8000/v1',
  };
  const baseUrl = normalizeBaseUrl(
    input.base_url,
    defaultUrls[engine] ?? 'https://openrouter.ai/api/v1',
  );

  if (engine === 'openrouter' || engine === 'openai' || engine === 'vllm') {
    return discoverOpenAiCompatibleModels(engine, baseUrl, input.api_key);
  }

  return discoverOpenAiCompatibleModels(engine, baseUrl, input.api_key);
}
