/*
 * Copyright Red Hat
 */

import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { alertApiRef } from '@backstage/core-plugin-api';
import type { SettingsShellProps } from './SettingsShell';
import { SettingsShell } from './SettingsShell';

type Settings = { name: string; token?: string };

const schema: SettingsShellProps<Settings>['schema'] = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', title: 'Display name', minLength: 3 },
    token: { type: 'string', title: 'API token' },
  },
};

describe('SettingsShell', () => {
  const onLoad = jest.fn();
  const onSave = jest.fn();
  const post = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    onLoad.mockResolvedValue({ name: 'Saved name', token: 'secret' });
    onSave.mockResolvedValue(undefined);
  });

  function renderShell(props: Partial<SettingsShellProps<Settings>> = {}) {
    return render(
      <TestApiProvider apis={[[alertApiRef, { post }]]}>
        <SettingsShell<Settings>
          schema={schema}
          onLoad={onLoad}
          onSave={onSave}
          {...props}
        />
      </TestApiProvider>,
    );
  }

  it('waits for loading before exposing fields and actions', async () => {
    let finishLoad!: (value: Settings) => void;
    onLoad.mockReturnValueOnce(
      new Promise<Settings>(resolve => {
        finishLoad = resolve;
      }),
    );
    renderShell();
    expect(
      screen.getByRole('progressbar', { name: 'Loading settings' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await act(async () => finishLoad({ name: 'Loaded name' }));
    expect(screen.getByRole('textbox', { name: /Display name/ })).toHaveValue(
      'Loaded name',
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Reset to saved' }),
    ).toBeEnabled();
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it('edits and submits validated data with a success alert', async () => {
    renderShell();
    const name = await screen.findByRole('textbox', { name: /Display name/ });
    expect(name).toHaveValue('Saved name');
    fireEvent.change(name, { target: { value: 'Edited name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        name: 'Edited name',
        token: 'secret',
      }),
    );
    expect(post).toHaveBeenCalledWith({
      message: 'Settings saved.',
      severity: 'success',
    });
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it('disables fields and both actions until a deferred save finishes', async () => {
    let finishSave!: () => void;
    onSave.mockReturnValueOnce(
      new Promise<void>(resolve => {
        finishSave = resolve;
      }),
    );
    renderShell();
    const name = await screen.findByRole('textbox', { name: /Display name/ });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('progressbar', { name: 'Saving' });
    expect(name).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'API token' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Reset to saved' }),
    ).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
    await act(async () => finishSave());
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(name).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Reset to saved' }),
    ).toBeEnabled();
    expect(post).toHaveBeenCalledWith({
      message: 'Settings saved.',
      severity: 'success',
    });
  });

  it('reloads saved values when resetting local edits', async () => {
    onLoad
      .mockResolvedValueOnce({ name: 'Original name' })
      .mockResolvedValueOnce({ name: 'Latest saved name' });
    renderShell();
    const name = await screen.findByRole('textbox', { name: /Display name/ });
    fireEvent.change(name, { target: { value: 'Unsaved edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset to saved' }));
    expect(
      await screen.findByRole('textbox', { name: /Display name/ }),
    ).toHaveValue('Latest saved name');
    expect(onLoad).toHaveBeenCalledTimes(2);
    expect(onSave).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    [new Error('Load denied'), 'Load denied'],
    ['offline', 'Failed to load settings'],
  ])('shows a load failure for %s', async (error, message) => {
    onLoad.mockRejectedValueOnce(error);
    renderShell();
    expect(
      await screen.findByText(`Failed to load settings: ${message}`),
    ).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    [new Error('Save denied'), 'Save denied'],
    ['offline', 'Failed to save settings.'],
  ])(
    'reports save failure for %s and allows retrying',
    async (error, message) => {
      onSave.mockRejectedValueOnce(error);
      renderShell();
      const name = await screen.findByRole('textbox', { name: /Display name/ });
      fireEvent.change(name, { target: { value: 'Keep this edit' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(post).toHaveBeenCalledWith({ message, severity: 'error' }),
      );
      expect(name).toHaveValue('Keep this edit');
      expect(name).toBeEnabled();
      expect(
        screen.getByRole('button', { name: 'Reset to saved' }),
      ).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(post).toHaveBeenLastCalledWith({
          message: 'Settings saved.',
          severity: 'success',
        }),
      );
      expect(onSave).toHaveBeenCalledTimes(2);
      expect(onSave).toHaveBeenLastCalledWith({
        name: 'Keep this edit',
        token: 'secret',
      });
    },
  );

  it('prevents saving readonly settings while allowing reload', async () => {
    renderShell({ readOnly: true });
    const name = await screen.findByRole('textbox', { name: /Display name/ });
    expect(name).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'API token' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.submit(name.closest('form')!);
    await act(async () => {});
    expect(onSave).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    const reset = screen.getByRole('button', { name: 'Reset to saved' });
    expect(reset).toBeEnabled();
    fireEvent.click(reset);
    await screen.findByRole('textbox', { name: /Display name/ });
    expect(onLoad).toHaveBeenCalledTimes(2);
  });

  it('uses the real schema validator to reject invalid data before saving', async () => {
    renderShell();
    const name = await screen.findByRole('textbox', { name: /Display name/ });
    fireEvent.change(name, { target: { value: 'ab' } });
    fireEvent.submit(name.closest('form')!);
    expect(
      await screen.findAllByText(/must NOT have fewer than 3 characters/),
    ).not.toHaveLength(0);
    expect(onSave).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: 'Valid name' } });
    fireEvent.submit(name.closest('form')!);
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        name: 'Valid name',
        token: 'secret',
      }),
    );
  });

  it('passes uiSchema to RJSF and renders custom actions and child content', async () => {
    renderShell({
      uiSchema: {
        token: {
          'ui:widget': 'password',
          'ui:help': 'Keep your token private',
        },
      },
      saveLabel: 'Apply settings',
      resetLabel: 'Reload configuration',
      children: <a href="/settings/help">Settings documentation</a>,
    });
    await screen.findByRole('textbox', { name: /Display name/ });
    expect(screen.getByLabelText('API token')).toHaveAttribute(
      'type',
      'password',
    );
    expect(screen.getByText('Keep your token private')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Settings documentation' }),
    ).toHaveAttribute('href', '/settings/help');
    expect(
      screen.getByRole('button', { name: 'Reload configuration' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Submit' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply settings' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        name: 'Saved name',
        token: 'secret',
      }),
    );
  });
});
