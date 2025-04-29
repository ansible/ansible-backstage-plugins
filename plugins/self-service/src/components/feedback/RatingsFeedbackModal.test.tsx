import React from 'react';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { screen } from '@testing-library/react';
import { registerMswTestHooks, renderInTestApp } from '@backstage/test-utils';
import RatingsFeedbackModal from './RatingsFeedbackModal';

describe('Ratings feedback modal', () => {
  const server = setupServer();
  registerMswTestHooks(server);

  beforeEach(() => {
    server.use(
      rest.get('/*', (_, res, ctx) => res(ctx.status(200), ctx.json({}))),
    );
  });

  const render = (children: JSX.Element) => {
    return renderInTestApp(<>{children}</>);
  };

  it('should render', async () => {
    const handleClose = jest.fn(); // Mock handleClose function
    const open = true; // Set open to true to ensure the modal is visible

    await render(
      <RatingsFeedbackModal handleClose={handleClose} open={open} />,
    );

    expect(
      screen.getByText('Share Your Valuable Feedback'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Type of feedback')).toBeInTheDocument();
    expect(screen.getByText('How was your experience?')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Tell us why', { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Red Hat's Privacy Statement/i }),
    ).toHaveAttribute('href', 'https://www.redhat.com/en/about/privacy-policy');
    expect(screen.getByText('Submit')).toBeInTheDocument();
  });
});
