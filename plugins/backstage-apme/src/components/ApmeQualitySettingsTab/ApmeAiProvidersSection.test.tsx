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
  const getAiEngines = jest.fn();
  const createAiProvider = jest.fn();
  const updateAiProvider = jest.fn();
  const deleteAiProvider = jest.fn();
  const updatePortalSettings = jest.fn();

  const apmeApi = {
    getAiProviders,
    getAiStatus,
    getAiModels,
    getAiEngines,
    createAiProvider,
    updateAiProvider,
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
    createAiProvider.mockResolvedValue(undefined);
    updateAiProvider.mockResolvedValue(undefined);
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
  });

  it('renders provider list with engine chip and model count', async () => {
    getAiProviders.mockResolvedValue([
      {
        id: 1,
        name: 'my-openrouter',
        engine: 'openrouter',
        models: ['gpt-4o', 'gpt-4'],
      },
    ]);
    renderSection();
    expect(await screen.findByText('my-openrouter')).toBeInTheDocument();
    expect(screen.getByText('openrouter')).toBeInTheDocument();
    expect(screen.getByText(/2 models: gpt-4o, gpt-4/)).toBeInTheDocument();
  });

  it('renders providers sorted by name', async () => {
    getAiProviders.mockResolvedValue([
      { id: 3, name: 'zeta-provider', engine: 'openai', models: [] },
      { id: 1, name: 'Alpha-provider', engine: 'anthropic', models: [] },
      { id: 2, name: 'beta-provider', engine: 'openrouter', models: [] },
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

  it('shows remove confirm dialog and calls deleteAiProvider on confirm', async () => {
    getAiProviders.mockResolvedValueOnce([
      { id: 7, name: 'my-provider', engine: 'anthropic', models: [] },
    ]);
    deleteAiProvider.mockResolvedValue(undefined);
    getAiProviders.mockResolvedValueOnce([]);

    renderSection();
    const removeBtn = await screen.findByRole('button', {
      name: /remove provider my-provider/i,
    });
    fireEvent.click(removeBtn);

    expect(
      await screen.findByRole('heading', { name: /remove provider/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));

    await waitFor(() => {
      expect(deleteAiProvider).toHaveBeenCalledWith(7);
    });
  });

  it('save calls createAiProvider with apiKey and models', async () => {
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
      expect(createAiProvider).toHaveBeenCalledWith({
        name: 'new-prov',
        engine: 'openai',
        apiKey: 'sk-test',
        models: { 'gpt-4o': {} },
      });
    });
    await waitFor(() => {
      expect(updatePortalSettings).toHaveBeenCalledWith({
        defaultAiModelId: 'new-prov/gpt-4o',
      });
    });
  });
});
