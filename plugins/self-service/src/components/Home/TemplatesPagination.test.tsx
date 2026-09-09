import { render, screen, fireEvent } from '@testing-library/react';
import { TemplatesPagination } from './TemplatesPagination';

describe('TemplatesPagination', () => {
  it('renders range summary and page size selector', () => {
    render(
      <TemplatesPagination
        totalCount={42}
        pageLimit={20}
        page={0}
        totalPages={3}
        startIndex={1}
        endIndex={20}
        onPageChange={jest.fn()}
        onPageSizeChange={jest.fn()}
      />,
    );

    expect(screen.getByText('1–20 of 42 templates')).toBeInTheDocument();
    expect(screen.getByTestId('templates-page-size-select')).toHaveTextContent(
      '20',
    );
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('shows 1 / 1 with disabled navigation on a single page', () => {
    render(
      <TemplatesPagination
        totalCount={6}
        pageLimit={20}
        page={0}
        totalPages={1}
        startIndex={1}
        endIndex={6}
        onPageChange={jest.fn()}
        onPageSizeChange={jest.fn()}
      />,
    );

    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Previous page')).toBeDisabled();
    expect(screen.getByLabelText('Next page')).toBeDisabled();
    expect(
      screen.getByTestId('templates-page-size-select'),
    ).toBeInTheDocument();
  });

  it('calls onPageChange when navigating', () => {
    const onPageChange = jest.fn();

    render(
      <TemplatesPagination
        totalCount={48}
        pageLimit={20}
        page={1}
        totalPages={4}
        startIndex={21}
        endIndex={40}
        onPageChange={onPageChange}
        onPageSizeChange={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('Next page'));
    expect(onPageChange).toHaveBeenCalledWith(40);
  });
});
