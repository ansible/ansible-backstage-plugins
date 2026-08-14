/*
 * Copyright Red Hat
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApmeAiProviderDialog } from './ApmeAiProviderDialog';

const mockGetAiEngines = jest.fn();
jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: () => ({ getAiEngines: mockGetAiEngines }),
}));

const MOCK_ENGINES = [
  { id: 'openai', requiresKey: true, defaultEnvVar: 'OPENAI_API_KEY' },
  {
    id: 'ollama',
    requiresKey: false,
    defaultBaseUrl: 'http://localhost:11434',
  },
  { id: 'redhat', requiresKey: true },
];

describe('ApmeAiProviderDialog', () => {
  const onClose = jest.fn();
  const onSave = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    onSave.mockResolvedValue(undefined);
    mockGetAiEngines.mockResolvedValue({ engines: MOCK_ENGINES });
  });

  function renderDialog(props?: { provider?: any }) {
    return render(
      <ApmeAiProviderDialog
        open
        provider={props?.provider}
        onClose={onClose}
        onSave={onSave}
      />,
    );
  }

  it('renders step 1 setup form for add', async () => {
    renderDialog();
    expect(screen.getByText('Add AI provider')).toBeInTheDocument();
    expect(screen.getByLabelText('Provider name')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText(/Engine/i)).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('API key')).toBeInTheDocument();
  });

  it('lists live engines from getAiEngines (openai, ollama, redhat)', async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByLabelText(/Engine/i)).toBeInTheDocument(),
    );
    fireEvent.mouseDown(screen.getByLabelText(/Engine/i));
    expect(screen.getByRole('option', { name: 'openai' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'ollama' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'redhat' })).toBeInTheDocument();
  });

  it('filters out mock engine from live list', async () => {
    mockGetAiEngines.mockResolvedValue({
      engines: [...MOCK_ENGINES, { id: 'mock', requiresKey: false }],
    });
    renderDialog();
    await waitFor(() =>
      expect(screen.getByLabelText(/Engine/i)).toBeInTheDocument(),
    );
    fireEvent.mouseDown(screen.getByLabelText(/Engine/i));
    expect(
      screen.queryByRole('option', { name: 'mock' }),
    ).not.toBeInTheDocument();
  });

  it('renders edit title when provider is supplied', async () => {
    renderDialog({
      provider: {
        id: 1,
        name: 'my-prov',
        engine: 'openai',
        models: ['gpt-4o'],
      },
    });
    expect(screen.getByText('Edit provider: my-prov')).toBeInTheDocument();
    expect(screen.queryByLabelText('Provider name')).not.toBeInTheDocument();
  });

  it('shows unknown engine in edit mode even if not in live list', async () => {
    renderDialog({
      provider: { id: 1, name: 'my-prov', engine: 'custom-engine', models: [] },
    });
    await waitFor(() =>
      expect(screen.getByLabelText(/Engine/i)).toBeInTheDocument(),
    );
    fireEvent.mouseDown(screen.getByLabelText(/Engine/i));
    expect(
      screen.getByRole('option', { name: 'custom-engine' }),
    ).toBeInTheDocument();
  });

  it('requires API key before advancing when engine needs a key', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Provider name'), {
      target: { value: 'my-provider' },
    });
    await waitFor(() =>
      expect(screen.getByLabelText(/Engine/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: /next: models/i }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-test' },
    });
    expect(
      screen.getByRole('button', { name: /next: models/i }),
    ).not.toBeDisabled();
  });

  it('calls onSave with apiKey and models', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Provider name'), {
      target: { value: 'test-prov' },
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
      expect(onSave).toHaveBeenCalledWith('test-prov', {
        configure: {
          engine: 'openai',
          apiKey: 'sk-test',
        },
        models: ['gpt-4o'],
      });
    });
  });

  it('omits apiKey from configure when left blank (edit)', async () => {
    renderDialog({
      provider: {
        id: 1,
        name: 'existing',
        engine: 'openai',
        models: ['gpt-4o'],
        hasApiKey: true,
      },
    });

    await waitFor(() =>
      expect(screen.getByLabelText(/Engine/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /next: models/i }));
    await screen.findByText(/Step 2 of 2/);

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        'existing',
        expect.objectContaining({
          configure: expect.not.objectContaining({
            apiKey: expect.anything(),
          }),
        }),
      );
    });
  });

  it('shows error when onSave rejects', async () => {
    onSave.mockRejectedValue(new Error('configure failed'));
    renderDialog();
    fireEvent.change(screen.getByLabelText('Provider name'), {
      target: { value: 'p1' },
    });

    await waitFor(() =>
      expect(screen.getByLabelText(/Engine/i)).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-x' },
    });
    fireEvent.click(screen.getByRole('button', { name: /next: models/i }));
    await screen.findByText(/Step 2 of 2/);

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText('configure failed')).toBeInTheDocument();
  });
});
