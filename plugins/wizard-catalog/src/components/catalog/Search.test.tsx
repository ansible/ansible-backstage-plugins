import React from 'react'; // Import React to avoid TS2686
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SearchBar } from './SearchBar';

describe('SearchBar Component', () => {
  let mockOnSearchChange: jest.Mock;

  beforeEach(() => {
    mockOnSearchChange = jest.fn();
    jest.useFakeTimers(); // Mock timers to control the debounce
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render the search input and clear button', () => {
    render(<SearchBar onSearchChange={mockOnSearchChange} />);

    // Check if the input field is rendered
    const inputElement = screen.getByPlaceholderText('Search');
    expect(inputElement).toBeInTheDocument();

    // Check if the clear button is rendered
    const clearButton = screen.getByText('Clear');
    expect(clearButton).toBeInTheDocument();
  });

  it('should call onSearchChange when typing in the input field', async () => {
    render(<SearchBar onSearchChange={mockOnSearchChange} />);

    const inputElement = screen.getByPlaceholderText('Search');
    fireEvent.change(inputElement, { target: { value: 'Hello' } });

    // Simulate the debounce delay (300ms)
    act(() => {
      jest.advanceTimersByTime(300); // Fast forward timers
    });

    expect(mockOnSearchChange).toHaveBeenCalledWith('Hello');
  });

  it('should clear the input and call onSearchChange with an empty string when the clear button is clicked', () => {
    render(<SearchBar onSearchChange={mockOnSearchChange} />);

    const inputElement = screen.getByPlaceholderText(
      'Search',
    ) as HTMLInputElement; // Cast to HTMLInputElement
    const clearButton = screen.getByText('Clear');

    // Type something in the input
    fireEvent.change(inputElement, { target: { value: 'Search text' } });

    // Click on the clear button
    fireEvent.click(clearButton);

    expect(inputElement.value).toBe('');
    expect(mockOnSearchChange).toHaveBeenCalledWith('');
  });
});
