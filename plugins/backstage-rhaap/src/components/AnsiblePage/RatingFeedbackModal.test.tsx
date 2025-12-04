import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RatingsFeedbackModal from './RatingsFeedbackModal';
import { useAnalytics } from '@backstage/core-plugin-api';

jest.mock('@backstage/core-plugin-api');

describe('RatingsFeedbackModal', () => {
  const handleClose = jest.fn();
  const captureEventMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAnalytics as jest.Mock).mockReturnValue({
      captureEvent: captureEventMock,
    });
  });

  it('renders modal with sentiment feedback by default', () => {
    render(<RatingsFeedbackModal handleClose={handleClose} />);
    expect(screen.getByTestId('ratings-feedback-modal')).toBeInTheDocument();
    expect(screen.getByTestId('user-ratings')).toBeInTheDocument();
    expect(screen.getByTestId('tell-us-why')).toBeInTheDocument();
    expect(screen.getByTestId('sentiment-checkbox')).toBeInTheDocument();
    expect(screen.getByTestId('sentiment-submit-btn')).toBeDisabled();
  });

  it('enables submit button when all sentiment fields are filled', () => {
    render(<RatingsFeedbackModal handleClose={handleClose} />);

    // Fill rating
    const ratingStars = screen
      .getByTestId('user-ratings')
      .querySelectorAll('label');
    fireEvent.click(ratingStars[2]); // 3 stars

    // Fill feedback text
    const feedbackInput = screen
      .getByTestId('tell-us-why')
      .querySelector('textarea');
    fireEvent.change(feedbackInput!, { target: { value: 'Great product!' } });

    // Check the checkbox
    const checkbox = screen.getByTestId('sentiment-checkbox');
    fireEvent.click(checkbox);

    expect(screen.getByTestId('sentiment-submit-btn')).not.toBeDisabled();
  });

  it('sends sentiment feedback and shows snackbar', async () => {
    render(<RatingsFeedbackModal handleClose={handleClose} />);

    const ratingStars = screen
      .getByTestId('user-ratings')
      .querySelectorAll('label');
    fireEvent.click(ratingStars[2]);
    const feedbackInput = screen
      .getByTestId('tell-us-why')
      .querySelector('textarea');
    fireEvent.change(feedbackInput!, { target: { value: 'Nice!' } });
    fireEvent.click(screen.getByTestId('sentiment-checkbox'));

    fireEvent.click(screen.getByTestId('sentiment-submit-btn'));

    await waitFor(() => {
      expect(captureEventMock).toHaveBeenCalledWith('feedback', 'sentiment', {
        attributes: { type: 'sentiment', ratings: 3, feedback: 'Nice!' },
      });
    });

    expect(
      screen.getByText(/Thank you for sharing your ratings and feedback/),
    ).toBeInTheDocument();
  });

  it('should show help icon and tooltip', () => {
    render(<RatingsFeedbackModal handleClose={handleClose} />);

    const helpIcon = screen.getByTestId('feedback-help-icon');
    expect(helpIcon).toBeInTheDocument();

    expect(screen.getByTitle('Feedback Requirements')).toBeInTheDocument();
  });

  it('should open help popover when help icon is clicked', async () => {
    render(<RatingsFeedbackModal handleClose={handleClose} />);

    const helpIcon = screen.getByTestId('feedback-help-icon');
    fireEvent.click(helpIcon);

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
  });

  it('should clear timeout when feedback is submitted', async () => {
    jest.useFakeTimers();
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    render(<RatingsFeedbackModal handleClose={handleClose} />);

    const ratingStars = screen
      .getByTestId('user-ratings')
      .querySelectorAll('label');
    fireEvent.click(ratingStars[2]);
    const feedbackInput = screen
      .getByTestId('tell-us-why')
      .querySelector('textarea');
    fireEvent.change(feedbackInput!, { target: { value: 'Test feedback' } });
    fireEvent.click(screen.getByTestId('sentiment-checkbox'));
    fireEvent.click(screen.getByTestId('sentiment-submit-btn'));

    jest.advanceTimersByTime(500);

    expect(clearTimeoutSpy).toHaveBeenCalled();

    jest.useRealTimers();
    clearTimeoutSpy.mockRestore();
  });
});
