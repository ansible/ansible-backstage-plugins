import React, { createContext, ReactNode, useContext, useState } from 'react';

const FAVORITE_STORAGE_KEY = '/starredEntities/entityRefs';

// Define the shape of the Favorites context
interface FavoritesContextProps {
  starredEntities: string[];
  isFavorite: (namespace?: string, name?: string) => boolean;
  toggleFavorite: (namespace?: string, name?: string) => boolean;
}

// Create the context
const FavoritesContext = createContext<FavoritesContextProps | undefined>(
  undefined,
);

interface FavoritesProviderProps {
  children: ReactNode;
}

// Create the provider
export const FavoritesProvider: React.FC<FavoritesProviderProps> = ({
  children,
}) => {
  const [starredEntities, setStarredEntities] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(FAVORITE_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const setFavorites = (favorites: string[]) => {
    try {
      localStorage.setItem(FAVORITE_STORAGE_KEY, JSON.stringify(favorites));
      setStarredEntities(favorites);
    } catch (err) {
      console.error('Failed to save favorites:', err); // eslint-disable-line no-console
    }
  };

  const isFavorite = (namespace?: string, name?: string): boolean => {
    if (!namespace || !name) return false;
    const entityRef = `template:${namespace}/${name}`;
    return starredEntities.includes(entityRef);
  };

  const toggleFavorite = (namespace?: string, name?: string): boolean => {
    if (!namespace || !name) return false;

    const entityRef = `template:${namespace}/${name}`;
    if (starredEntities.includes(entityRef)) {
      setFavorites(starredEntities.filter(item => item !== entityRef));
      return false;
    }
    setFavorites([...starredEntities, entityRef]);
    return true;
  };

  return (
    <FavoritesContext.Provider
      value={{
        starredEntities,
        isFavorite,
        toggleFavorite,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
};

// Hook to use the Favorites context
export const useFavorites = (): FavoritesContextProps => {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
};
