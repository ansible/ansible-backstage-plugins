/*
 * Copyright Red Hat
 */

import { render, screen } from '@testing-library/react';
import { QualityWorkflowStepper } from './QualityWorkflowStepper';

describe('QualityWorkflowStepper', () => {
  it('shows Generate fixes, Push branch, and Open PR steps', () => {
    render(<QualityWorkflowStepper activeStep="select" />);
    expect(screen.getByText('Generate fixes')).toBeTruthy();
    expect(screen.queryByText('Review & edit')).toBeNull();
    expect(screen.getByText('Push branch')).toBeTruthy();
    expect(screen.getByText('Open pull request')).toBeTruthy();
  });

  it('maps generate to Generate fixes and review to Push branch', () => {
    const { rerender } = render(
      <QualityWorkflowStepper activeStep="generate" busy />,
    );
    expect(screen.getByText('Generate fixes').closest('span')).toBeTruthy();

    rerender(<QualityWorkflowStepper activeStep="review" />);
    expect(screen.getByText('Push branch').closest('span')).toBeTruthy();

    rerender(<QualityWorkflowStepper activeStep="push" />);
    expect(screen.getByText('Push branch').closest('span')).toBeTruthy();

    rerender(<QualityWorkflowStepper activeStep="pr" busy />);
    expect(screen.getByText('Open pull request').closest('span')).toBeTruthy();

    rerender(<QualityWorkflowStepper activeStep="verify" />);
    expect(screen.getByText('Generate fixes').closest('span')).toBeTruthy();
  });

  it('shows a busy spinner on the active Push branch step', () => {
    const { container } = render(
      <QualityWorkflowStepper activeStep="push" busy />,
    );
    expect(container.querySelector('.MuiCircularProgress-root')).toBeTruthy();
  });

  it('marks all steps complete when activeStep is verify', () => {
    const { container } = render(
      <QualityWorkflowStepper activeStep="verify" />,
    );
    expect(container.querySelectorAll('svg')).toHaveLength(4);
  });

  it('exposes workflow help via aria-label', () => {
    render(
      <QualityWorkflowStepper
        activeStep="select"
        helpText="Custom remediation help"
      />,
    );
    expect(screen.getByLabelText('Workflow help')).toBeTruthy();
  });
});
