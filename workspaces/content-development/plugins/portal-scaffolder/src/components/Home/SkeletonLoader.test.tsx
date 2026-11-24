import { render } from '@testing-library/react';
import { SkeletonLoader } from './SkeletonLoader';

describe('SkeletonLoader', () => {
  it('renders a card with skeleton elements', () => {
    const { container } = render(<SkeletonLoader />);
    const skeletons = container.querySelectorAll('.MuiSkeleton-root');
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
  });

  it('renders within a Card component', () => {
    const { container } = render(<SkeletonLoader />);
    expect(container.querySelector('.MuiCard-root')).toBeInTheDocument();
  });

  it('renders CardHeader, CardContent, and CardActions', () => {
    const { container } = render(<SkeletonLoader />);
    expect(container.querySelector('.MuiCardHeader-root')).toBeInTheDocument();
    expect(container.querySelector('.MuiCardContent-root')).toBeInTheDocument();
    expect(container.querySelector('.MuiCardActions-root')).toBeInTheDocument();
  });
});
