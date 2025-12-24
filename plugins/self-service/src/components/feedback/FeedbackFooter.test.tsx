import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configApiRef } from '@backstage/core-plugin-api';

// --- Mocks ---
// Mock RatingsFeedbackModal inside jest.mock to avoid ReferenceError
jest.mock('./RatingsFeedbackModal', () => ({
  __esModule: true,
  default: jest.fn((props: any) => (
    <div
      data-testid="mock-ratings-modal"
      data-open={props.open ? 'true' : 'false'}
    />
  )),
}));

import { FeedbackFooter } from './FeedbackFooter';

// Mock useTheme only — keep all other @material-ui/core exports intact
jest.mock('@material-ui/core', () => {
  const actual = jest.requireActual('@material-ui/core');
  return {
    ...actual,
    useTheme: () => ({ palette: { type: 'light' } }),
  };
});

// Mock config API that enables feedback
const mockConfigApi = {
  getOptionalBoolean: (key: string) => {
    if (key === 'ansible.feedback.enabled') {
      return true;
    }
    return undefined;
  },
  getString: jest.fn(),
  getOptionalString: jest.fn(),
  getConfig: jest.fn(),
  getOptionalConfig: jest.fn(),
  getConfigArray: jest.fn(),
  getOptionalConfigArray: jest.fn(),
  getNumber: jest.fn(),
  getOptionalNumber: jest.fn(),
  getBoolean: jest.fn(),
  getStringArray: jest.fn(),
  getOptionalStringArray: jest.fn(),
  keys: jest.fn(),
  has: jest.fn(),
};

describe('FeedbackFooter', () => {
  let mockRatingsFeedbackModal: jest.Mock;

  beforeEach(() => {
    // Access the mock function from the module after jest.mock
    mockRatingsFeedbackModal = require('./RatingsFeedbackModal').default;
    jest.clearAllMocks();
  });

  it('renders the FAB with "Feedback" label', async () => {
    await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, mockConfigApi]]}>
        <FeedbackFooter />
      </TestApiProvider>,
    );

    expect(screen.getByText(/Feedback/i)).toBeInTheDocument();

    const fab = screen.getByRole('button', { name: /Feedback/i });
    expect(fab).toBeInTheDocument();
  });

  it('opens RatingsFeedbackModal when FAB is clicked and passes correct props', async () => {
    const user = userEvent.setup();

    await renderInTestApp(
      <TestApiProvider apis={[[configApiRef, mockConfigApi]]}>
        <FeedbackFooter />
      </TestApiProvider>,
    );

    const fab = screen.getByRole('button', { name: /Feedback/i });
    await user.click(fab);

    const modal = screen.getByTestId('mock-ratings-modal');
    expect(modal).toBeInTheDocument();

    // The mock component should have been called once
    expect(mockRatingsFeedbackModal).toHaveBeenCalledTimes(1);

    // Inspect the props passed to the mocked RatingsFeedbackModal
    const passedProps = mockRatingsFeedbackModal.mock.calls[0][0];
    expect(typeof passedProps.handleClose).toBe('function');
    expect(passedProps.open).toBe(true);
  });
});
