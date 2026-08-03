/*
 * Copyright Red Hat
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { apmeApiRef } from '../../api';
import { ApmeAiProvidersSection } from './ApmeAiProvidersSection';

describe('ApmeAiProvidersSection', () => {
  const getAiProviders = jest.fn();
  const getAiStatus = jest.fn();
  const getAiModels = jest.fn();
  const getAiConfig = jest.fn();
  const getAiEngines = jest.fn();
  const configureAiProvider = jest.fn();
  const deleteAiProvider = jest.fn();

  const apmeApi = {
    getAiProviders,
    getAiStatus,
    getAiModels,
    getAiConfig,
    getAiEngines,
    configureAiProvider,
    deleteAiProvider,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getAiStatus.mockResolvedValue({ enableAi: true, connected: true, modelCount: 2 });
    getAiProviders.mockResolvedValue([]);
    getAiModels.mockResolvedValue([]);
    getAiConfig.mockResolvedValue(undefined);
    getAiEngines.mockResolvedValue({ engines: [
      { id: 'openai', requiresKey: true },
      { id: 'anthropic', requiresKey: true },
    ]});
  });

  function renderSection() {
    return render(
      <TestApiProvider apis={[[apmeApiRef, apmeApi as any]]}>
        <ApmeAiProvidersSection />
      </TestApiProvider>,
    );
  }

  it('renders AI providers card heading', async () => {
    renderSection();
    expect(await screen.findByText('AI providers')).toBeInTheDocument();
  });

  it('shows connected status chip from getAiStatus', async () => {
    renderSection();
    expect(await screen.findByText(/Connected · 2 models/i)).toBeInTheDocument();
  });

  it('shows empty state when no providers', async () => {
    renderSection();
    expect(await screen.findByText(/no providers configured/i)).toBeInTheDocument();
  });

  it('shows available models section and model chips when providers empty but models returned', async () => {
    getAiModels.mockResolvedValue([
      { id: 'gpt-4o', provider: 'openai', name: 'GPT-4o' },
      { id: 'claude-3-opus', provider: 'anthropic', name: 'Claude 3 Opus' },
    ]);
    renderSection();
    expect(await screen.findByText('Available models')).toBeInTheDocument();
    expect(screen.getByTitle('gpt-4o (openai)')).toBeInTheDocument();
    expect(screen.getByTitle('claude-3-opus (anthropic)')).toBeInTheDocument();
    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
    expect(screen.getByText('Claude 3 Opus')).toBeInTheDocument();
  });

  it('renders provider list with engine chip and model count', async () => {
    getAiProviders.mockResolvedValue([
      { id: 'my-openrouter', engine: 'openrouter', models: ['gpt-4o', 'gpt-4'] },
    ]);
    renderSection();
    expect(await screen.findByText('my-openrouter')).toBeInTheDocument();
    expect(screen.getByText('openrouter')).toBeInTheDocument();
    expect(screen.getByText(/2 models: gpt-4o, gpt-4/)).toBeInTheDocument();
  });

  it('renders providers sorted by id when API returns unsorted list', async () => {
    getAiProviders.mockResolvedValue([
      { id: 'zeta-provider', engine: 'openai', models: [] },
      { id: 'Alpha-provider', engine: 'anthropic', models: [] },
      { id: 'beta-provider', engine: 'openrouter', models: [] },
    ]);
    renderSection();
    await screen.findByText('Alpha-provider');

    const items = screen.getAllByRole('listitem');
    const ids = items.map(item => item.textContent ?? '');
    expect(ids[0]).toMatch(/Alpha-provider/);
    expect(ids[1]).toMatch(/beta-provider/);
    expect(ids[2]).toMatch(/zeta-provider/);
  });

  it('opens add dialog on "Add provider" click', async () => {
    renderSection();
    await screen.findByText('AI providers');
    fireEvent.click(screen.getByRole('button', { name: /add provider/i }));
    expect(screen.getByText('Add AI provider')).toBeInTheDocument();
  });

  it('opens edit dialog on Edit icon click', async () => {
    getAiProviders.mockResolvedValue([
      { id: 'my-provider', engine: 'anthropic', models: ['claude-3'] },
    ]);
    renderSection();
    const editBtn = await screen.findByRole('button', { name: /edit provider my-provider/i });
    fireEvent.click(editBtn);
    expect(screen.getByText('Edit provider: my-provider')).toBeInTheDocument();
  });

  it('shows remove confirm dialog and calls deleteAiProvider on confirm', async () => {
    getAiProviders.mockResolvedValueOnce([
      { id: 'my-provider', engine: 'anthropic', models: [] },
    ]);
    deleteAiProvider.mockResolvedValue(undefined);
    // After delete, reload returns empty list
    getAiProviders.mockResolvedValueOnce([]);

    renderSection();
    const removeBtn = await screen.findByRole('button', { name: /remove provider my-provider/i });
    fireEvent.click(removeBtn);

    // Confirm dialog should appear
    expect(await screen.findByRole('heading', { name: /remove provider/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));

    await waitFor(() => {
      expect(deleteAiProvider).toHaveBeenCalledWith('my-provider');
    });
  });

  it('shows error when deleteAiProvider fails', async () => {
    getAiProviders.mockResolvedValueOnce([
      { id: 'fail-provider', engine: 'openrouter', models: [] },
    ]);
    deleteAiProvider.mockRejectedValue(new Error('Gateway timeout'));

    renderSection();
    const removeBtn = await screen.findByRole('button', { name: /remove provider fail-provider/i });
    fireEvent.click(removeBtn);

    fireEvent.click(await screen.findByRole('button', { name: /^remove$/i }));

    expect(await screen.findByText('Gateway timeout')).toBeInTheDocument();
  });
});
