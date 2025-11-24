import { Typography } from '@material-ui/core';

export const DocsContent = () => {
  return (
    <div data-testid="docs-content">
      <Typography variant="h4" style={{ marginBottom: 16 }}>
        Documentation
      </Typography>
      <Typography variant="body1">
        Documentation for Execution Environments will be available here.
      </Typography>
    </div>
  );
};
