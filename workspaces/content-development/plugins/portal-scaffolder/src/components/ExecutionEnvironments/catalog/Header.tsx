import { Entity } from '@backstage/catalog-model';
import { FavoriteEntity } from '@backstage/plugin-catalog-react';
import { Box, IconButton, Typography } from '@material-ui/core';

interface HeaderProps {
  templateName: string;
  entity: Entity | undefined;
}

export const Header = ({ templateName, entity }: HeaderProps) => {
  return (
    <Box display="flex" alignItems="center">
      <Typography variant="h5" style={{ fontWeight: 700, fontSize: '1.5rem' }}>
        {templateName}
      </Typography>

      <IconButton size="small">
        {entity && <FavoriteEntity entity={entity} />}
      </IconButton>
    </Box>
  );
};
