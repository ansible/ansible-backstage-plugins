import React from 'react';
import IconButton from '@mui/material/IconButton';
import { StarRate, StarBorder } from '@mui/icons-material';
import { useFavorites } from '../../helpers/Favorite';

interface FavoritesButtonProps {
  namespace?: string;
  name?: string;
}

export const FavoriteTemplateStar: React.FC<FavoritesButtonProps> = ({
  namespace,
  name,
}) => {
  const { isFavorite, toggleFavorite } = useFavorites();

  const handleToggleFavorite = () => {
    if (!namespace || !name) {
      return;
    }
    toggleFavorite(namespace, name);
  };

  return (
    <IconButton
      aria-label="add to favorites"
      size="large"
      onClick={handleToggleFavorite}
    >
      {isFavorite(namespace, name) ? (
        <StarRate style={{ color: '#f3ba37' }} />
      ) : (
        <StarBorder />
      )}
    </IconButton>
  );
};
