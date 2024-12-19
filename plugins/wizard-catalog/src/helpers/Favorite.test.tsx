import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { FavoritesProvider, useFavorites } from './Favorite';

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

describe('FavoritesProvider', () => {
  const TestComponent = () => {
    const { starredEntities, isFavorite, toggleFavorite } = useFavorites();

    return (
      <div>
        <div data-testid="starredEntities">
          {JSON.stringify(starredEntities)}
        </div>
        <button
          data-testid="toggleFavorite"
          onClick={() => toggleFavorite('default', 'example')}
        >
          Toggle Favorite
        </button>
        <div data-testid="isFavorite">
          {isFavorite('default', 'example') ? 'true' : 'false'}
        </div>
      </div>
    );
  };

  beforeEach(() => {
    mockLocalStorage.clear();
  });

  test('renders with default empty state', () => {
    render(
      <FavoritesProvider>
        <TestComponent />
      </FavoritesProvider>,
    );

    expect(screen.getByTestId('starredEntities').textContent).toBe('[]');
    expect(screen.getByTestId('isFavorite').textContent).toBe('false');
  });

  test('adds an entity to favorites when toggled', () => {
    render(
      <FavoritesProvider>
        <TestComponent />
      </FavoritesProvider>,
    );

    act(() => {
      screen.getByTestId('toggleFavorite').click();
    });

    expect(screen.getByTestId('starredEntities').textContent).toBe(
      '["template:default/example"]',
    );
    expect(screen.getByTestId('isFavorite').textContent).toBe('true');
  });

  test('removes an entity from favorites when toggled again', async () => {
    render(
      <FavoritesProvider>
        <TestComponent />
      </FavoritesProvider>,
    );

    // Add to favorites
    await act(async () => {
      screen.getByTestId('toggleFavorite').click();
    });

    // Remove from favorites
    await act(async () => {
      screen.getByTestId('toggleFavorite').click();
    });

    expect(screen.getByTestId('starredEntities').textContent).toBe('[]');
    expect(screen.getByTestId('isFavorite').textContent).toBe('false');
  });

  test('persists favorites in localStorage', () => {
    render(
      <FavoritesProvider>
        <TestComponent />
      </FavoritesProvider>,
    );

    act(() => {
      screen.getByTestId('toggleFavorite').click();
    });

    expect(localStorage.getItem('/starredEntities/entityRefs')).toBe(
      JSON.stringify(['template:default/example']),
    );
  });

  test('loads favorites from localStorage on initialization', () => {
    localStorage.setItem(
      '/starredEntities/entityRefs',
      JSON.stringify(['template:default/example']),
    );

    render(
      <FavoritesProvider>
        <TestComponent />
      </FavoritesProvider>,
    );

    expect(screen.getByTestId('starredEntities').textContent).toBe(
      '["template:default/example"]',
    );
    expect(screen.getByTestId('isFavorite').textContent).toBe('true');
  });

  test('throws error if useFavorites is used outside of FavoritesProvider', () => {
    const ErrorComponent = () => {
      useFavorites();
      return null;
    };

    expect(() => render(<ErrorComponent />)).toThrow(
      'useFavorites must be used within a FavoritesProvider',
    );
  });
});
