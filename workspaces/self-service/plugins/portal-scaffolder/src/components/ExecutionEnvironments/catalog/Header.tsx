import { Entity } from '@backstage/catalog-model';
import { FavoriteEntity } from '@backstage/plugin-catalog-react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';

interface HeaderProps {
  templateName: string;
  entity: Entity | undefined;
}

export const Header = ({ templateName, entity }: HeaderProps) => {
  return (
    <Box display="flex" alignItems="center">
      <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.5rem' }}>
        {templateName}
      </Typography>

      <IconButton size="small">
        {entity && <FavoriteEntity entity={entity} />}
      </IconButton>
    </Box>
  );
};
