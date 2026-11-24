/*
 * Copyright 2026 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderTestApp } from '@backstage/frontend-test-utils';
import plugin from './alpha';

jest.mock('./components/OverviewContent', () => ({
  EntityOverviewContent: () => <div>Ansible overview content</div>,
}));
jest.mock('./components/CatalogContent', () => ({
  EntityCatalogContent: () => <div>Ansible catalog content</div>,
}));
jest.mock('./components/CreateContent', () => ({
  EntityCreateContent: () => <div>Ansible create content</div>,
}));
jest.mock('./components/LearnContent', () => ({
  EntityLearnContent: () => <div>Ansible learn content</div>,
}));

describe('native Ansible plugin', () => {
  it.each([
    ['/ansible', 'Ansible overview content', 'Overview'],
    ['/ansible/overview', 'Ansible overview content', 'Overview'],
    ['/ansible/myitems', 'Ansible catalog content', 'My Items'],
    ['/ansible/create', 'Ansible create content', 'Create'],
    ['/ansible/learn', 'Ansible learn content', 'Learn'],
  ])('renders %s with the matching tab', async (path, content, tab) => {
    await renderTestApp({
      features: [plugin],
      initialRouteEntries: [path],
    });

    expect(await screen.findByText(content)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: tab })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
  });

  it('navigates between tabs from a direct subpage load', async () => {
    await renderTestApp({
      features: [plugin],
      initialRouteEntries: ['/ansible/learn'],
    });
    expect(
      await screen.findByText('Ansible learn content'),
    ).toBeInTheDocument();

    for (const [tab, content] of [
      ['My Items', 'Ansible catalog content'],
      ['Create', 'Ansible create content'],
      ['Overview', 'Ansible overview content'],
      ['Learn', 'Ansible learn content'],
    ]) {
      fireEvent.click(screen.getByRole('tab', { name: tab }));
      expect(await screen.findByText(content)).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: tab })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    }
  });

  it('keeps tab navigation under a host-configured page path', async () => {
    await renderTestApp({
      features: [plugin],
      config: {
        app: {
          extensions: [{ 'page:ansible': { config: { path: '/automation' } } }],
        },
      },
      initialRouteEntries: ['/automation/learn'],
    });
    expect(
      await screen.findByText('Ansible learn content'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(
      await screen.findByText('Ansible overview content'),
    ).toBeInTheDocument();
  });
});
