import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TagFilterPicker } from './TagFilterPicker';

describe('TagFilterPicker', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with the correct label', () => {
    render(
      <TagFilterPicker
        label="Tags"
        options={['tag1', 'tag2']}
        value={[]}
        onChange={mockOnChange}
      />,
    );

    expect(screen.getByText('Tags')).toBeInTheDocument();
  });

  it('should render with custom placeholder', () => {
    render(
      <TagFilterPicker
        label="Tags"
        options={['tag1', 'tag2']}
        value={[]}
        onChange={mockOnChange}
        placeholder="Select tags..."
      />,
    );

    expect(screen.getByPlaceholderText('Select tags...')).toBeInTheDocument();
  });

  it('should use label as default placeholder when placeholder is not provided', () => {
    render(
      <TagFilterPicker
        label="Tags"
        options={['tag1', 'tag2']}
        value={[]}
        onChange={mockOnChange}
      />,
    );

    expect(screen.getByPlaceholderText('Tags')).toBeInTheDocument();
  });

  it('should display options when opened', async () => {
    render(
      <TagFilterPicker
        label="Tags"
        options={['tag1', 'tag2', 'tag3']}
        value={[]}
        onChange={mockOnChange}
      />,
    );

    const input = screen.getByPlaceholderText('Tags');
    fireEvent.mouseDown(input);

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    expect(screen.getByText('tag1')).toBeInTheDocument();
    expect(screen.getByText('tag2')).toBeInTheDocument();
    expect(screen.getByText('tag3')).toBeInTheDocument();
  });

  it('should call onChange when an option is selected', async () => {
    render(
      <TagFilterPicker
        label="Tags"
        options={['tag1', 'tag2']}
        value={[]}
        onChange={mockOnChange}
      />,
    );

    const input = screen.getByPlaceholderText('Tags');
    fireEvent.mouseDown(input);

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('tag1'));

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalledWith(['tag1']);
    });
  });

  it('should display selected values as chips', async () => {
    render(
      <TagFilterPicker
        label="Tags"
        options={['tag1', 'tag2', 'tag3']}
        value={['tag1', 'tag2']}
        onChange={mockOnChange}
      />,
    );

    expect(screen.getByText('tag1')).toBeInTheDocument();
    expect(screen.getByText('tag2')).toBeInTheDocument();
  });

  it('should display custom noOptionsText when no options available', async () => {
    render(
      <TagFilterPicker
        label="Tags"
        options={[]}
        value={[]}
        onChange={mockOnChange}
        noOptionsText="No tags found"
      />,
    );

    const input = screen.getByPlaceholderText('Tags');
    fireEvent.change(input, { target: { value: 'xyz' } });

    await waitFor(() => {
      expect(screen.getByText('No tags found')).toBeInTheDocument();
    });
  });

  it('should display default noOptionsText when no custom text provided', async () => {
    render(
      <TagFilterPicker
        label="Tags"
        options={[]}
        value={[]}
        onChange={mockOnChange}
      />,
    );

    const input = screen.getByPlaceholderText('Tags');
    fireEvent.change(input, { target: { value: 'xyz' } });

    await waitFor(() => {
      expect(screen.getByText('No options available')).toBeInTheDocument();
    });
  });

  it('should render options with checkboxes', async () => {
    render(
      <TagFilterPicker
        label="Tags"
        options={['tag1', 'tag2']}
        value={[]}
        onChange={mockOnChange}
      />,
    );

    const input = screen.getByPlaceholderText('Tags');
    fireEvent.mouseDown(input);

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThan(0);
  });

  it('should keep dropdown open after selection (disableCloseOnSelect)', async () => {
    render(
      <TagFilterPicker
        label="Tags"
        options={['tag1', 'tag2', 'tag3']}
        value={[]}
        onChange={mockOnChange}
      />,
    );

    const input = screen.getByPlaceholderText('Tags');
    fireEvent.mouseDown(input);

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('tag1'));

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    expect(screen.getByText('tag2')).toBeInTheDocument();
    expect(screen.getByText('tag3')).toBeInTheDocument();
  });

  it('should render Typography label with correct styling', () => {
    render(
      <TagFilterPicker
        label="Custom Label"
        options={['option1']}
        value={[]}
        onChange={mockOnChange}
      />,
    );

    const label = screen.getByText('Custom Label');
    expect(label).toBeInTheDocument();
    expect(label.tagName.toLowerCase()).toBe('label');
  });

  it('should be a controlled component', () => {
    const { rerender } = render(
      <TagFilterPicker
        label="Tags"
        options={['tag1', 'tag2']}
        value={[]}
        onChange={mockOnChange}
      />,
    );

    expect(screen.queryByText('tag1')).not.toBeInTheDocument();

    rerender(
      <TagFilterPicker
        label="Tags"
        options={['tag1', 'tag2']}
        value={['tag1']}
        onChange={mockOnChange}
      />,
    );

    expect(screen.getByText('tag1')).toBeInTheDocument();
  });
});
