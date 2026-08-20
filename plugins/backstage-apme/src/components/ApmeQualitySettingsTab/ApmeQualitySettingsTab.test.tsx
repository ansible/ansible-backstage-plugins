/*
 * Copyright Red Hat
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { apmeApiRef } from '../../api';
import { ApmeQualitySettingsTab } from './ApmeQualitySettingsTab';

jest.mock('@backstage/plugin-permission-react', () => ({
  RequirePermission: (props: any) => props.children,
}));

describe('ApmeQualitySettingsTab', () => {
  const getPortalSettings = jest.fn();
  const updatePortalSettings = jest.fn();
  const getAiProviders = jest.fn();
  const getAiStatus = jest.fn();
  const configureAiProvider = jest.fn();
  const deleteAiProvider = jest.fn();

  const apmeApi = {
    getPortalSettings,
    updatePortalSettings,
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
      gatewayBaseUrl: 'http://localhost:8080',
    });
    updatePortalSettings.mockResolvedValue({
      enableAi: true,
      publishViaGateway: true,
      targetAnsibleCoreVersion: '2.18',
      gatewayBaseUrl: 'http://localhost:8080',
    });
    getAiProviders.mockResolvedValue([]);
    getAiStatus.mockResolvedValue({
      enableAi: true,
      connected: false,
      modelCount: 0,
    });
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
    expect(screen.getByLabelText('APME Gateway URL')).toHaveValue(
      'http://localhost:8080',
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
    fireEvent.click(
      await screen.findByRole('option', { name: 'ansible-core 2.18' }),
    );

    const save = screen.getByRole('button', { name: /^save$/i });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => {
      expect(updatePortalSettings).toHaveBeenCalledWith({
        targetAnsibleCoreVersion: '2.18',
        gatewayBaseUrl: 'http://localhost:8080',
      });
    });
    expect(
      await screen.findByText('Quality defaults saved.'),
    ).toBeInTheDocument();
  });

  it('saves a Gateway URL via updatePortalSettings', async () => {
    renderTab();
    await screen.findByText('Quality settings');

    const urlField = screen.getByLabelText('APME Gateway URL');
    fireEvent.change(urlField, {
      target: { value: 'http://host.containers.internal:8080' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(updatePortalSettings).toHaveBeenCalledWith({
        targetAnsibleCoreVersion: '2.16',
        gatewayBaseUrl: 'http://host.containers.internal:8080',
      });
    });
  });

  it('shows an error panel when load fails', async () => {
    getPortalSettings.mockRejectedValueOnce(new Error('settings unavailable'));
    renderTab();
    expect(
      await screen.findByText(/settings unavailable/i),
    ).toBeInTheDocument();
  });

  it('renders the AI providers card below quality settings', async () => {
    renderTab();
    expect(await screen.findByText('Quality settings')).toBeInTheDocument();
    expect(await screen.findByText('AI providers')).toBeInTheDocument();
    expect(getAiProviders).toHaveBeenCalled();
  });

  it('does not render the Galaxy servers section', async () => {
    renderTab();
    expect(await screen.findByText('Quality settings')).toBeInTheDocument();
    expect(screen.queryByText('Galaxy servers')).not.toBeInTheDocument();
  });
});
