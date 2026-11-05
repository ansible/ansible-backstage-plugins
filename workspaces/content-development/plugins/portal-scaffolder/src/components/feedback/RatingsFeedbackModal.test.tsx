import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { registerMswTestHooks, renderInTestApp } from '@backstage/test-utils';

// Mock analytics & small backstage helpers before importing the component
const mockCaptureEvent = jest.fn();
jest.mock('@backstage/core-plugin-api', () => {
  const actual = jest.requireActual('@backstage/core-plugin-api');
  return {
    ...actual,
    useAnalytics: () => ({ captureEvent: mockCaptureEvent }),
    // provide a no-op required helper so some backstage internals don't fail
    attachComponentData: () => {},
    createPlugin: (opts: any) => opts,
    createRoutableExtension: (opts: any) => opts,
  };
});

import RatingsFeedbackModal from './RatingsFeedbackModal';

describe('Ratings feedback modal', () => {
  const server = setupServer();
  registerMswTestHooks(server);

  beforeEach(() => {
    mockCaptureEvent.mockClear();
    server.use(
      rest.get('/*', (_, res, ctx) => res(ctx.status(200), ctx.json({}))),
    );
  });

  const render = (children: JSX.Element) => renderInTestApp(<>{children}</>);

  it('should render static elements', async () => {
    const handleClose = jest.fn();
    await render(<RatingsFeedbackModal handleClose={handleClose} open />);

    expect(
      screen.getByText('Share Your Valuable Feedback'),
    ).toBeInTheDocument();
    expect(screen.getByText('How was your experience?')).toBeInTheDocument();
    expect(screen.getByLabelText(/Tell us why/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Red Hat's Privacy Statement/i }),
    ).toHaveAttribute('href', 'https://www.redhat.com/en/about/privacy-policy');
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
  });

  it('sends sentiment feedback and shows snackbar', async () => {
    const handleClose = jest.fn();
    await render(<RatingsFeedbackModal handleClose={handleClose} open />);

    const user = userEvent.setup();

    // Try to click a rating (Rating may render as radio inputs)
    const ratingRadios = screen.queryAllByRole('radio');
    if (ratingRadios.length > 0) {
      await user.click(ratingRadios[ratingRadios.length - 1]); // pick highest rating if present
    } else {
      // If radios not present, try clicking the visible Rating element
      const rating = screen.queryByLabelText('How was your experience?');
      if (rating) {
        await user.click(rating);
      }
    }

    // Fill feedback textarea
    const feedbackField = screen.getByLabelText(/Tell us why/i);
    await user.clear(feedbackField);
    await user.type(feedbackField, 'This is a helpful feedback note.');

    // Toggle checkbox by clicking visible label text
    await user.click(
      screen.getByText(/I understand that feedback is shared with Red Hat\./i),
    );

    // Assert checkbox became checked (role-based)
    const checkbox = screen.getByRole('checkbox', {
      name: /I understand that feedback is shared with Red Hat\./i,
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    // Submit
    const submitBtn = screen.getByTestId('sentiment-submit-btn');
    await user.click(submitBtn);

    // Wait for analytics to be called and snackbar to appear
    await waitFor(() =>
      expect(mockCaptureEvent).toHaveBeenCalledWith(
        'feedback',
        'sentiment',
        expect.objectContaining({
          attributes: expect.objectContaining({
            type: 'sentiment',
            feedback: 'This is a helpful feedback note.',
            ratings: expect.any(Number),
          }),
        }),
      ),
    );

    expect(
      await screen.findByText(
        /Thank you for sharing your ratings and feedback/i,
      ),
    ).toBeInTheDocument();
  });

  it('should show help icon and tooltip', async () => {
    const handleClose = jest.fn();
    await render(<RatingsFeedbackModal handleClose={handleClose} open />);

    const helpIcon = screen.getByTestId('feedback-help-icon');
    expect(helpIcon).toBeInTheDocument();

    expect(screen.getByTitle('Feedback Requirements')).toBeInTheDocument();
  });

  it('should open help popover when help icon is clicked', async () => {
    const handleClose = jest.fn();
    await render(<RatingsFeedbackModal handleClose={handleClose} open />);

    const user = userEvent.setup();

    const helpIcon = screen.getByTestId('feedback-help-icon');
    await user.click(helpIcon);

    expect(screen.getByTestId('feedback-help-popover')).toBeInTheDocument();
    expect(screen.getByText('Feedback Requirements')).toBeInTheDocument();
    expect(
      screen.getByText('To share feedback, please provide:'),
    ).toBeInTheDocument();
    expect(screen.getByText('A rating (1-5 stars)')).toBeInTheDocument();
    expect(screen.getByText('Detailed feedback text')).toBeInTheDocument();
    expect(
      screen.getByText('Consent to share with Red Hat'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Please ensure any ad-blockers are disabled/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Red Hat Privacy Policy/ }),
    ).toBeInTheDocument();
  });

  it('should close help popover when pressing escape key', async () => {
    const handleClose = jest.fn();
    await render(<RatingsFeedbackModal handleClose={handleClose} open />);

    const user = userEvent.setup();

    const helpIcon = screen.getByTestId('feedback-help-icon');
    await user.click(helpIcon);

    expect(screen.getByTestId('feedback-help-popover')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(
      screen.queryByTestId('feedback-help-popover'),
    ).not.toBeInTheDocument();
  });
});
