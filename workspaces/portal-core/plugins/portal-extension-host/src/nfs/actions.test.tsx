import { createPortalContributionProvider } from './createPortalContributionProvider';
import '@testing-library/jest-dom';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { compatWrapper } from '@backstage/core-compat-api';
import { createFrontendPlugin } from '@backstage/frontend-plugin-api';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import {
  AuthorizeResult,
  createPermission,
} from '@backstage/plugin-permission-common';
import {
  portalOperationsApiRef,
  CONTENT_TYPES,
} from '@ansible/portal-extension-api';
import {
  EntityActionBlueprint,
  EntityDetailTabBlueprint,
  type EntityActionDescriptor,
  type EntityDetailTabDescriptor,
  type EntityContributionContext,
} from '@ansible/portal-extension-api/alpha';
import { createPortalEntityPage } from './createPortalEntityPage';
import {
  PortalEntitySurface,
  PortalOperationAction,
} from './PortalEntityActions';
import { collectEntityActions } from './validateEntityAction';
import { catalogApiRef } from '@backstage/plugin-catalog-react';

const context: EntityContributionContext = {
  entity: {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'repo', namespace: 'default' },
  },
  contentType: CONTENT_TYPES.PLAYBOOK_REPOSITORY,
  sourceKinds: ['git'],
};
const permission = createPermission({
  name: 'scanner.scan',
  attributes: { action: 'create' },
});
function descriptor(): EntityActionDescriptor {
  return {
    manifest: {
      id: 'scanner',
      apiVersion: '0.1.0',
      version: '1.0.0',
      entitlements: [
        {
          id: 'scanner.available',
          displayName: 'Available',
          description: 'Available',
          scope: 'organization',
          permissionName: 'scanner.use',
        },
      ],
      capabilities: [
        {
          id: 'scanner.quality',
          ownerPlugin: 'scanner',
          experienceId: 'content-quality-assessment',
          displayName: 'Quality',
          description: 'Quality',
          minimumHostApiVersion: '0.1.0',
          appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
          entryPoints: [
            {
              id: 'scanner.quality.overview',
              kind: 'entity-tab',
              surface: 'entity-page',
              label: 'Overview',
              order: 0,
              appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
              launches: { type: 'slot', targetSlot: 'entity.detail.tabs' },
            },
            {
              id: 'scanner.quality.results',
              kind: 'entity-tab',
              surface: 'entity-page',
              label: 'Results',
              order: 10,
              appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
              launches: { type: 'slot', targetSlot: 'entity.detail.tabs' },
            },
            {
              id: 'scanner.quality.scan',
              kind: 'entity-action',
              surface: 'entity-page',
              label: 'Scan',
              requiredPermission: permission,
              appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
              launches: {
                type: 'operation',
                operationId: 'scanner.scan',
                followOn: { type: 'slot', targetSlot: 'entity.detail.tabs' },
              },
            },
          ],
        },
      ],
    },
    capabilityId: 'scanner.quality',
    entryPointId: 'scanner.quality.scan',
    attachment: 'entity.actions',
    followOnEntryPointId: 'scanner.quality.results',
    requiredEntitlements: ['scanner.available'],
    enabledByConfig: 'scanner.enabled',
  };
}

describe('confirmed subject removal', () => {
  function removal() {
    const action = descriptor();
    delete action.followOnEntryPointId;
    const entry = action.manifest.capabilities[0].entryPoints[2];
    entry.launches = { type: 'operation', operationId: 'scanner.remove' };
    action.confirmation = {
      title: 'Remove repository?',
      description: 'Remove registration only; preserve scan history.',
      confirmLabel: 'Remove repository',
    };
    action.completion = 'subject-removed';
    return action;
  }
  async function renderRemoval(
    execute: jest.Mock,
    onSubjectRemoved = jest.fn(),
    getEntityByRef = jest.fn().mockResolvedValue(undefined),
  ) {
    const action = removal();
    const page = createPortalEntityPage({
      path: '/remove',
      loader: async () =>
        compatWrapper(
          <PortalOperationAction
            action={action}
            context={context}
            onSelect={() => {}}
            onSubjectRemoved={onSubjectRemoved}
          />,
        ),
    });
    await renderTestApp({
      features: [
        createFrontendPlugin({
          pluginId: 'portal',
          extensions: [createPortalContributionProvider(), page],
        }),
      ],
      apis: [
        [portalOperationsApiRef, { execute }],
        [catalogApiRef, { getEntityByRef }],
      ],
      initialRouteEntries: ['/remove'],
    });
    return onSubjectRemoved;
  }
  it('does not execute on open or cancel and refreshes only after confirmed removal', async () => {
    const execute = jest
      .fn()
      .mockResolvedValue({ result: { subjectRemoved: true } });
    const removed = await renderRemoval(execute);
    fireEvent.click(await screen.findByRole('button', { name: 'Scan' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(execute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(execute).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Scan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove repository' }));
    await waitFor(() => expect(removed).toHaveBeenCalledTimes(1));
    expect(execute).toHaveBeenCalledWith('scanner.remove', {
      subject: { entityRef: 'component:default/repo' },
    });
  });
  it.each([false, true])(
    'preserves the dialog and never refreshes on failure/unconfirmed outcome: %s',
    async reject => {
      const execute = reject
        ? jest.fn().mockRejectedValue(new Error('failed'))
        : jest.fn().mockResolvedValue({ result: { subjectRemoved: false } });
      const removed = await renderRemoval(execute);
      fireEvent.click(await screen.findByRole('button', { name: 'Scan' }));
      fireEvent.click(
        screen.getByRole('button', { name: 'Remove repository' }),
      );
      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(screen.getByRole('dialog')).toBeTruthy();
      expect(removed).not.toHaveBeenCalled();
    },
  );
  it('requires valid confirmation for removal declarations', () => {
    const action = removal();
    expect(collectEntityActions([action])).toHaveLength(1);
    delete action.confirmation;
    expect(collectEntityActions([action])).toEqual([]);
  });
  it('checks again after a read failure without resubmitting accepted removal', async () => {
    const execute = jest
      .fn()
      .mockResolvedValue({ result: { subjectRemoved: true } });
    const read = jest
      .fn()
      .mockRejectedValueOnce(new Error('Catalog unavailable'))
      .mockResolvedValue(undefined);
    const removed = jest.fn();
    await renderRemoval(execute, removed, read);
    fireEvent.click(await screen.findByRole('button', { name: 'Scan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove repository' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'verification failed',
    );
    expect(removed).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Check catalog removal' }),
    );
    await waitFor(() => expect(removed).toHaveBeenCalledTimes(1));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(2);
  });
});

describe('native entity actions', () => {
  const execute = jest.fn();
  const check = jest.fn();
  const resultsLoader = jest.fn(async () => <div>Quality results</div>);
  async function compose(
    options: {
      action?: EntityActionDescriptor;
      contentType?: string;
      sourceKinds?: string[];
      enabled?: boolean;
      deny?: boolean;
      experiences?: string[];
      missingResolver?: boolean;
      missingResults?: boolean;
      hiddenResults?: boolean;
      pluginId?: string;
    } = {},
  ) {
    const action = options.action ?? descriptor();
    const tabs: EntityDetailTabDescriptor[] = ['overview', 'results']
      .filter(id => id !== 'results' || !options.missingResults)
      .map(id => ({
        ...action,
        attachment: 'entity.detail.tabs',
        entryPointId: `scanner.quality.${id}`,
        requiredEntitlements: [],
        enabledByConfig: undefined,
        isApplicable:
          id === 'results' && options.hiddenResults ? () => false : undefined,
        loader:
          id === 'results'
            ? resultsLoader
            : async () => <div>Host overview tab</div>,
      }));
    const current = {
      ...context,
      contentType: options.contentType ?? context.contentType,
      sourceKinds: options.sourceKinds ?? context.sourceKinds,
    };
    const page = createPortalEntityPage({
      path: '/entity',
      loader: async (collectedTabs, actions) =>
        compatWrapper(
          <>
            <div>Entity overview remains</div>
            <PortalEntitySurface
              tabs={collectedTabs}
              actions={actions}
              context={current}
              availableExperiences={options.experiences}
              checkEntitlement={options.missingResolver ? undefined : check}
            />
          </>,
        ),
    });
    await renderTestApp({
      features: [
        createFrontendPlugin({
          pluginId: 'portal',
          extensions: [createPortalContributionProvider(), page],
        }),
        createFrontendPlugin({
          pluginId: options.pluginId ?? 'scanner',
          extensions: [
            EntityActionBlueprint.make({ name: 'scan', params: action }),
            ...tabs.map((params, i) =>
              EntityDetailTabBlueprint.make({ name: `tab-${i}`, params }),
            ),
          ],
        }),
      ],
      apis: [
        [portalOperationsApiRef, { execute }],
        mockApis.permission({
          authorize: options.deny
            ? AuthorizeResult.DENY
            : AuthorizeResult.ALLOW,
        }),
      ],
      config: { scanner: { enabled: options.enabled ?? true } },
      initialRouteEntries: ['/entity'],
    });
    await screen.findByText('Entity overview remains');
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Loading available tabs'),
      ).not.toBeInTheDocument(),
    );
  }
  beforeEach(() => {
    jest.clearAllMocks();
    execute.mockResolvedValue({ result: { jobId: 'scan-1' } });
    check.mockResolvedValue(true);
  });
  it('discovers the action, passes only the current subject, and opens the eligible results tab', async () => {
    await compose();
    const button = await screen.findByRole('button', { name: 'Scan' });
    expect(resultsLoader).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(await screen.findByText('Quality results')).toBeInTheDocument();
    expect(execute).toHaveBeenCalledWith('scanner.scan', {
      subject: { entityRef: 'component:default/repo' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('request accepted');
    expect(screen.getByRole('tab', { name: 'Results' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
  it('prevents repeated clicks while an operation is pending', async () => {
    let complete!: (value: { result: unknown }) => void;
    execute.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          complete = resolve;
        }),
    );
    await compose();
    const button = await screen.findByRole('button', { name: 'Scan' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    complete({ result: { jobId: 'scan-1' } });
    await screen.findByText('Quality results');
  });
  it('refreshes results when the destination tab was already selected', async () => {
    await compose();
    fireEvent.click(await screen.findByRole('tab', { name: 'Results' }));
    await screen.findByText('Quality results');
    expect(resultsLoader).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByRole('button', { name: 'Scan' }));
    await waitFor(() => expect(resultsLoader).toHaveBeenCalledTimes(2));
  });
  it('supports an operation action without a follow-on destination', async () => {
    const action = descriptor();
    action.manifest.capabilities[0].entryPoints[2].launches = {
      type: 'operation',
      operationId: 'scanner.scan',
    };
    action.followOnEntryPointId = undefined;
    await compose({ action, missingResults: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Scan' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'request accepted',
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(resultsLoader).not.toHaveBeenCalled();
  });
  it('contains operation errors and does not navigate or retry automatically', async () => {
    execute.mockRejectedValue(new Error('unavailable'));
    await compose();
    fireEvent.click(await screen.findByRole('button', { name: 'Scan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'work may have started',
    );
    expect(screen.getByText('Entity overview remains')).toBeInTheDocument();
    expect(resultsLoader).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it.each([{ missingResults: true }, { hiddenResults: true }])(
    'blocks before dispatch when the follow-on cannot be honored: %j',
    async options => {
      await compose(options);
      const button = await screen.findByRole('button', { name: 'Scan' });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(execute).not.toHaveBeenCalled();
    },
  );
  it.each([
    { contentType: CONTENT_TYPES.COLLECTION },
    { enabled: false },
    { deny: true },
    { experiences: [] },
    { missingResolver: true },
  ])('filters before activation: %j', async options => {
    await compose(options);
    expect(
      screen.queryByRole('button', { name: 'Scan' }),
    ).not.toBeInTheDocument();
    expect(execute).not.toHaveBeenCalled();
  });
  it.each(['deny', 'error'])('fails closed on entitlement %s', async mode => {
    if (mode === 'deny') check.mockResolvedValue(false);
    else check.mockRejectedValue(new Error('unavailable'));
    await compose();
    await waitFor(() => expect(check).toHaveBeenCalled());
    expect(
      screen.queryByRole('button', { name: 'Scan' }),
    ).not.toBeInTheDocument();
    expect(execute).not.toHaveBeenCalled();
  });
  it('checks source scope before running domain predicates', async () => {
    const action = descriptor();
    action.appliesToSourceKinds = ['oci'];
    action.isApplicable = jest.fn(() => true);
    await compose({ action });
    expect(action.isApplicable).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Scan' }),
    ).not.toBeInTheDocument();
  });
  it.each([false, 'throws'])(
    'contains a suppressing predicate %j',
    async mode => {
      const action = descriptor();
      action.isApplicable = () => {
        if (mode === 'throws') throw new Error('broken predicate');
        return false;
      };
      await compose({ action });
      expect(
        screen.queryByRole('button', { name: 'Scan' }),
      ).not.toBeInTheDocument();
    },
  );
  it('verifies ownership against the actual frontend plugin', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await compose({ pluginId: 'impersonator' });
      expect(
        screen.queryByRole('button', { name: 'Scan' }),
      ).not.toBeInTheDocument();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('entity action contract validation', () => {
  it('rejects duplicates independently without dropping valid actions', () => {
    const action = descriptor();
    expect(collectEntityActions([action, action])).toEqual([action]);
  });
  it.each([
    'region',
    'operation-owner',
    'permission',
    'follow-on',
    'api',
    'content',
    'scope',
    'launch',
  ])('rejects malformed %s contracts', field => {
    const action = descriptor();
    const entry = action.manifest.capabilities[0].entryPoints[2];
    switch (field) {
      case 'region':
        action.attachment = 'invalid' as 'entity.actions';
        break;
      case 'operation-owner':
        entry.launches = { type: 'operation', operationId: 'other.scan' };
        action.followOnEntryPointId = undefined;
        break;
      case 'permission':
        entry.requiredPermission = undefined;
        break;
      case 'follow-on':
        action.followOnEntryPointId = 'scanner.missing';
        break;
      case 'api':
        action.manifest.apiVersion = '2.0.0';
        break;
      case 'content':
        entry.appliesToContentTypes = ['not-a-type'];
        break;
      case 'scope':
        entry.appliesToContentTypes = [CONTENT_TYPES.COLLECTION];
        break;
      case 'launch':
        entry.launches = { type: 'workflow', workflowId: 'scanner.workflow' };
        break;
      default:
        break;
    }
    expect(collectEntityActions([action])).toEqual([]);
  });
});
