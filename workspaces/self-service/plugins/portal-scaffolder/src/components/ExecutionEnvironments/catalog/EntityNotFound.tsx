import Box from '@mui/material/Box';
import { WarningPanel, Content } from '@backstage/core-components';

export const EntityNotFound: React.FC = () => {
  return (
    <Box>
      <Content>
        <Box sx={{ mt: 2, mb: 3, height: '80vh', borderRadius: '15px' }}>
          <WarningPanel title="Entity not found">
            There is no entity with the requested kind, namespace, and name.
          </WarningPanel>
        </Box>
      </Content>
    </Box>
  );
};
