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
  const updateAiConfig = jest.fn();
  const deleteAiProvider = jest.fn();
  const updatePortalSettings = jest.fn();

  const apmeApi = {
    getAiProviders,
    getAiStatus,
    getAiModels,
    getAiConfig,
    getAiEngines,
    configureAiProvider,
    updateAiConfig,
    deleteAiProvider,
    updatePortalSettings,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getAiStatus.mockResolvedValue({
      enableAi: true,
      connected: true,
      modelCount: 2,
    });
    getAiProviders.mockResolvedValue([]);
    getAiModels.mockResolvedValue([]);
    getAiConfig.mockResolvedValue(undefined);
    getAiEngines.mockResolvedValue({
      engines: [
        { id: 'openai', requiresKey: true, defaultEnvVar: 'OPENAI_API_KEY' },
        {
          id: 'anthropic',
          requiresKey: true,
          defaultEnvVar: 'ANTHROPIC_API_KEY',
        },
      ],
    });
    configureAiProvider.mockResolvedValue(undefined);
    updateAiConfig.mockResolvedValue(undefined);
    updatePortalSettings.mockResolvedValue({});
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
    expect(
      await screen.findByText(/Connected · 2 inference models/i),
    ).toBeInTheDocument();
  });

  it('shows empty state when no providers', async () => {
    renderSection();
    expect(
      await screen.findByText(/no providers configured/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/deploy-time config/i)).not.toBeInTheDocument();
  });

  it('shows ConfigMap providers as read-only system section', async () => {
    getAiProviders.mockResolvedValue([]);
    getAiConfig.mockResolvedValue({
      config: {
        providers: {
          'cm-prov': { engine: 'openai', models: { 'gpt-4o': {} } },
        },
      },
    });
    renderSection();

    expect(await screen.findByText('System providers')).toBeInTheDocument();
    expect(screen.getByText('cm-prov')).toBeInTheDocument();
    expect(screen.getByText('Source: ConfigMap')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /edit provider cm-prov/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /remove provider cm-prov/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps managed providers editable when ConfigMap also lists them', async () => {
    getAiProviders.mockResolvedValue([
      { id: 'shared', engine: 'openai', models: ['gpt-4o'] },
    ]);
    getAiConfig.mockResolvedValue({
      config: {
        providers: {
          shared: { engine: 'openai', models: { 'gpt-4o': {} } },
          'cm-only': { engine: 'anthropic', models: {} },
        },
      },
    });
    renderSection();

    expect(await screen.findByText('shared')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /edit provider shared/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('System providers')).toBeInTheDocument();
    expect(screen.getByText('cm-only')).toBeInTheDocument();
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
      {
        id: 'my-openrouter',
        engine: 'openrouter',
        models: ['gpt-4o', 'gpt-4'],
      },
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
    const editBtn = await screen.findByRole('button', {
      name: /edit provider my-provider/i,
    });
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
    const removeBtn = await screen.findByRole('button', {
      name: /remove provider my-provider/i,
    });
    fireEvent.click(removeBtn);

    // Confirm dialog should appear
    expect(
      await screen.findByRole('heading', { name: /remove provider/i }),
    ).toBeInTheDocument();
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
    const removeBtn = await screen.findByRole('button', {
      name: /remove provider fail-provider/i,
    });
    fireEvent.click(removeBtn);

    fireEvent.click(await screen.findByRole('button', { name: /^remove$/i }));

    expect(await screen.findByText('Gateway timeout')).toBeInTheDocument();
  });

  it('save calls configureAiProvider with apiKey + secretStore file then updateAiConfig with merged models', async () => {
    getAiConfig.mockResolvedValue({
      config: {
        providers: { 'existing-prov': { engine: 'anthropic' } },
        server: {},
      },
    });

    renderSection();
    await screen.findByText('AI providers');

    fireEvent.click(screen.getByRole('button', { name: /add provider/i }));
    fireEvent.change(screen.getByLabelText('Provider name'), {
      target: { value: 'new-prov' },
    });

    await waitFor(() =>
      expect(screen.getByLabelText(/Engine/i)).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /next: models/i }));

    const modelInput = await screen.findByLabelText('Model ID');
    fireEvent.change(modelInput, { target: { value: 'gpt-4o' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(configureAiProvider).toHaveBeenCalledWith('new-prov', {
        engine: 'openai',
        apiKey: 'sk-test',
        secretStore: 'file',
        secretName: 'OPENAI_API_KEY',
      });
    });
    await waitFor(() => {
      expect(updateAiConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          location: 'user',
          config: expect.objectContaining({
            providers: expect.objectContaining({
              'new-prov': expect.objectContaining({
                engine: 'openai',
                models: { 'gpt-4o': {} },
              }),
              'existing-prov': expect.objectContaining({ engine: 'anthropic' }),
            }),
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(updatePortalSettings).toHaveBeenCalledWith({
        defaultAiModelId: 'new-prov/gpt-4o',
      });
    });
  });

  it('save merges new provider models while preserving existing providers and server config', async () => {
    getAiConfig.mockResolvedValue({
      config: {
        providers: {
          'other-prov': { engine: 'anthropic', models: { 'claude-3': {} } },
        },
        server: { port: 8080 },
      },
    });

    renderSection();
    await screen.findByText('AI providers');

    fireEvent.click(screen.getByRole('button', { name: /add provider/i }));
    fireEvent.change(screen.getByLabelText('Provider name'), {
      target: { value: 'my-prov' },
    });

    await waitFor(() =>
      expect(screen.getByLabelText(/Engine/i)).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /next: models/i }));
    await screen.findByLabelText('Model ID');

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(updateAiConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            server: { port: 8080 },
            providers: expect.objectContaining({
              'other-prov': expect.objectContaining({ engine: 'anthropic' }),
              'my-prov': expect.objectContaining({ engine: 'openai' }),
            }),
          }),
        }),
      );
    });
  });
});
