import { render, screen, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { ansibleApiRef } from '../../apis';
import { JobTemplatesProvider, useJobTemplates } from './JobTemplatesProvider';

const mockAnsibleApi = {
  getUserJobTemplates: jest.fn(),
};

function Probe() {
  const { jobTemplates, loadState } = useJobTemplates();
  return (
    <div>
      <span data-testid="load-state">{loadState}</span>
      <span data-testid="template-count">{jobTemplates.length}</span>
    </div>
  );
}

describe('JobTemplatesProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAnsibleApi.getUserJobTemplates.mockResolvedValue({
      items: [{ id: 1, name: 'Demo' }],
    });
  });

  it('keeps loaded job templates when the consumer remounts', async () => {
    const { rerender } = render(
      <TestApiProvider apis={[[ansibleApiRef, mockAnsibleApi]]}>
        <JobTemplatesProvider>
          <Probe />
        </JobTemplatesProvider>
      </TestApiProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('load-state')).toHaveTextContent('ready');
      expect(screen.getByTestId('template-count')).toHaveTextContent('1');
    });

    expect(mockAnsibleApi.getUserJobTemplates).toHaveBeenCalledTimes(1);

    rerender(
      <TestApiProvider apis={[[ansibleApiRef, mockAnsibleApi]]}>
        <JobTemplatesProvider>
          <div />
        </JobTemplatesProvider>
      </TestApiProvider>,
    );

    rerender(
      <TestApiProvider apis={[[ansibleApiRef, mockAnsibleApi]]}>
        <JobTemplatesProvider>
          <Probe />
        </JobTemplatesProvider>
      </TestApiProvider>,
    );

    expect(screen.getByTestId('load-state')).toHaveTextContent('ready');
    expect(screen.getByTestId('template-count')).toHaveTextContent('1');
    expect(mockAnsibleApi.getUserJobTemplates).toHaveBeenCalledTimes(1);
  });
});
