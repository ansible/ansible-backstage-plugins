/*
 * Copyright Red Hat
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { apmeApiRef } from '../../api';
import { ApmeQualitySettingsTab } from './ApmeQualitySettingsTab';

describe('ApmeQualitySettingsTab', () => {
  const getPortalSettings = jest.fn();
  const updatePortalSettings = jest.fn();
  const listGalaxyServers = jest.fn();
  const createGalaxyServer = jest.fn();
  const updateGalaxyServer = jest.fn();
  const deleteGalaxyServer = jest.fn();
  const getAiProviders = jest.fn();
  const getAiStatus = jest.fn();
  const configureAiProvider = jest.fn();
  const deleteAiProvider = jest.fn();

  const apmeApi = {
    getPortalSettings,
    updatePortalSettings,
    listGalaxyServers,
    createGalaxyServer,
    updateGalaxyServer,
    deleteGalaxyServer,
    getAiProviders,
    getAiStatus,
    configureAiProvider,
    deleteAiProvider,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getPortalSettings.mockResolvedValue({
      enableAi: true,
      publishViaGateway: true,
      targetAnsibleCoreVersion: '2.16',
    });
    updatePortalSettings.mockResolvedValue({
      enableAi: true,
      publishViaGateway: true,
      targetAnsibleCoreVersion: '2.18',
    });
    listGalaxyServers.mockResolvedValue([
      {
        id: 1,
        name: 'galaxy',
        url: 'https://galaxy.ansible.com/api/',
        auth_url: '',
        has_token: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    getAiProviders.mockResolvedValue([]);
    getAiStatus.mockResolvedValue({ enableAi: true, connected: false, modelCount: 0 });
  });

  function renderTab() {
    return render(
      <TestApiProvider apis={[[apmeApiRef, apmeApi]]}>
        <ApmeQualitySettingsTab />
      </TestApiProvider>,
    );
  }

  it('loads current ansible-core target from portal settings', async () => {
    renderTab();
    expect(await screen.findByText('Quality settings')).toBeInTheDocument();
    expect(getPortalSettings).toHaveBeenCalled();
    expect(screen.getByLabelText(/target ansible-core/i)).toHaveTextContent(
      'ansible-core 2.16',
    );
    expect(
      screen.getByText(/AI-assisted remediation: enabled/i),
    ).toBeInTheDocument();
  });

  it('saves a new target via updatePortalSettings', async () => {
    renderTab();
    await screen.findByText('Quality settings');

    const select = screen.getByLabelText(/target ansible-core/i);
    fireEvent.mouseDown(select);
    fireEvent.click(await screen.findByRole('option', { name: 'ansible-core 2.18' }));

    const save = screen.getByRole('button', { name: /^save$/i });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => {
      expect(updatePortalSettings).toHaveBeenCalledWith({
        targetAnsibleCoreVersion: '2.18',
      });
    });
    expect(await screen.findByText('Quality defaults saved.')).toBeInTheDocument();
  });

  it('shows an error panel when load fails', async () => {
    getPortalSettings.mockRejectedValueOnce(new Error('settings unavailable'));
    renderTab();
    expect(await screen.findByText(/settings unavailable/i)).toBeInTheDocument();
  });

  it('renders the AI providers card below quality settings', async () => {
    renderTab();
    expect(await screen.findByText('Quality settings')).toBeInTheDocument();
    expect(await screen.findByText('AI providers')).toBeInTheDocument();
    expect(getAiProviders).toHaveBeenCalled();
  });

  it('renders galaxy servers section with list from gateway', async () => {
    renderTab();
    expect(await screen.findByText('Galaxy servers')).toBeInTheDocument();
    expect(listGalaxyServers).toHaveBeenCalled();
    expect(screen.getByText('galaxy')).toBeInTheDocument();
    expect(
      screen.getByText('https://galaxy.ansible.com/api/'),
    ).toBeInTheDocument();
  });
});
