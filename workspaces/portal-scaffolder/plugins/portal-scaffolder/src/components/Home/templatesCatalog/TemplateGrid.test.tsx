import { render, screen, fireEvent } from '@testing-library/react';
import { MockEntityListContextProvider } from '@backstage/plugin-catalog-react/testUtils';
import type { TemplateEntityV1beta3 } from '@backstage/plugin-scaffolder-common';
import { TemplateGrid } from './TemplateGrid';
import { toRefreshOffset } from './offsetRefresh';

jest.mock('../TemplateCard', () => ({
  WizardCard: ({ template }: { template: { metadata: { name: string } } }) => (
    <div data-testid={`card-${template.metadata.name}`} />
  ),
}));

const makeTemplate = (name: string, type = 'service'): TemplateEntityV1beta3 =>
  ({
    apiVersion: 'scaffolder.backstage.io/v1beta3',
    kind: 'Template',
    metadata: { name, uid: name, title: name },
    spec: { type, owner: 'team', parameters: [], steps: [] },
  }) as TemplateEntityV1beta3;

describe('TemplateGrid', () => {
  it('shows the empty state when there are no templates', () => {
    render(
      <MockEntityListContextProvider
        value={{
          entities: [],
          totalItems: 0,
          loading: false,
          limit: 20,
          offset: 0,
        }}
      >
        <TemplateGrid externalLoading={false} />
      </MockEntityListContextProvider>,
    );

    expect(screen.getByText('No templates found.')).toBeInTheDocument();
  });

  it('filters out execution-environment cards and changes page size', () => {
    const setOffset = jest.fn();
    const setLimit = jest.fn();
    render(
      <MockEntityListContextProvider
        value={{
          entities: [
            makeTemplate('svc'),
            makeTemplate('ee', 'execution-environment'),
          ],
          totalItems: 2,
          loading: false,
          limit: 20,
          offset: 0,
          setOffset,
          setLimit,
        }}
      >
        <TemplateGrid externalLoading={false} />
      </MockEntityListContextProvider>,
    );

    expect(screen.getByTestId('card-svc')).toBeInTheDocument();
    expect(screen.queryByTestId('card-ee')).toBeNull();

    fireEvent.mouseDown(screen.getByLabelText('Templates per page'));
    fireEvent.click(screen.getByRole('option', { name: '10' }));

    expect(setOffset).toHaveBeenCalledWith(0);
    expect(setLimit).toHaveBeenCalledWith(10);
  });

  it('resets offset when catalog limit is unsupported', () => {
    const setOffset = jest.fn();
    const setLimit = jest.fn();
    render(
      <MockEntityListContextProvider
        value={{
          entities: [makeTemplate('svc')],
          totalItems: 1,
          loading: false,
          limit: 15,
          offset: 20,
          setOffset,
          setLimit,
        }}
      >
        <TemplateGrid externalLoading={false} />
      </MockEntityListContextProvider>,
    );

    expect(setOffset).toHaveBeenCalledWith(0);
    expect(setLimit).toHaveBeenCalledWith(20);
  });

  it('restores page offset when advancing pages', () => {
    const setOffset = jest.fn();
    render(
      <MockEntityListContextProvider
        value={{
          entities: [makeTemplate('svc')],
          totalItems: 40,
          loading: false,
          limit: 20,
          offset: toRefreshOffset(0),
          setOffset,
          setLimit: jest.fn(),
        }}
      >
        <TemplateGrid externalLoading={false} />
      </MockEntityListContextProvider>,
    );

    fireEvent.click(screen.getByLabelText('Next page'));
    expect(setOffset).toHaveBeenCalledWith(20);
  });
});
