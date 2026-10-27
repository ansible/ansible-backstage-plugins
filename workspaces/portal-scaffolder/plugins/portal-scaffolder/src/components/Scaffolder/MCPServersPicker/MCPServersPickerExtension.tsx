import { useState, useEffect } from 'react';
import { FieldExtensionComponentProps } from '@backstage/plugin-scaffolder-react';
import { Typography, Box, Paper, Grid } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import InfoIcon from '@material-ui/icons/Info';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import GitHubIcon from '@material-ui/icons/GitHub';
import CloudIcon from '@material-ui/icons/Cloud';
import StorageIcon from '@material-ui/icons/Storage';
import DnsIcon from '@material-ui/icons/Dns';
import CodeIcon from '@material-ui/icons/Code';
import ExtensionIcon from '@material-ui/icons/Extension';
import type { ComponentType } from 'react';

type IconComponent = ComponentType<{ className?: string }>;

const getIconForEnum = (enumName: string): IconComponent => {
  const serverName = enumName.toLowerCase().trim();

  if (serverName.includes('github')) {
    return GitHubIcon;
  }
  if (serverName.includes('gitlab') || serverName.includes('git-lab')) {
    return CodeIcon;
  }
  if (
    serverName.includes('cloud') ||
    serverName.includes('aws') ||
    serverName.includes('azure') ||
    serverName.includes('gcp')
  ) {
    return CloudIcon;
  }
  if (
    serverName.includes('database') ||
    serverName.includes('db') ||
    serverName.includes('storage') ||
    serverName.includes('postgres') ||
    serverName.includes('mysql') ||
    serverName.includes('mongodb')
  ) {
    return StorageIcon;
  }
  if (
    serverName.includes('dns') ||
    serverName.includes('server') ||
    serverName.includes('api')
  ) {
    return DnsIcon;
  }

  return ExtensionIcon;
};

const useStyles = makeStyles(theme => ({
  title: {
    fontSize: '1.2rem',
    fontWeight: 500,
    marginBottom: theme.spacing(2),
    color: theme.palette.text.primary,
  },
  cardsContainer: {
    marginBottom: theme.spacing(2),
  },
  card: {
    position: 'relative',
    padding: theme.spacing(2),
    border: `2px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.background.paper,
    cursor: 'pointer',
    transition: 'all 0.2s ease-in-out',
    '&:hover': {
      borderColor: '#4caf50',
      boxShadow: theme.shadows[2],
    },
  },
  cardSelected: {
    borderColor: '#4caf50',
    backgroundColor: theme.palette.action.selected,
  },
  cardContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  cardIcon: {
    marginRight: theme.spacing(1.5),
    fontSize: '1.5rem',
    color: theme.palette.text.secondary,
  },
  cardText: {
    fontSize: '1rem',
    fontWeight: 500,
    color: theme.palette.text.primary,
    flex: 1,
  },
  checkIcon: {
    color: '#4caf50',
    fontSize: '1.5rem',
  },
  noteBox: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: theme.spacing(1.5),
    border: `2px solid #9c27b0`,
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.background.paper,
    marginTop: theme.spacing(2),
  },
  noteIcon: {
    color: '#9c27b0',
    marginRight: theme.spacing(1),
    marginTop: theme.spacing(0.25),
    fontSize: '1.2rem',
  },
  noteText: {
    color: theme.palette.text.primary,
    fontSize: '0.875rem',
    lineHeight: 1.5,
  },
}));

export const MCPServersPickerExtension = ({
  onChange,
  disabled,
  rawErrors = [],
  schema,
  uiSchema,
  formData,
}: FieldExtensionComponentProps<string[]>) => {
  const classes = useStyles();

  const enumValues = (schema?.items as any)?.enum || [];
  const enumNames = (schema?.items as any)?.enumNames || [];

  const [selectedServers, setSelectedServers] = useState<Set<string>>(
    new Set(formData || []),
  );

  const customTitle =
    uiSchema?.['ui:options']?.title || schema?.title || 'Add MCP Servers';

  useEffect(() => {
    setSelectedServers(new Set(formData || []));
  }, [formData]);

  const handleCardClick = (value: string) => {
    if (disabled) return;

    const updatedSelected = new Set(selectedServers);
    if (updatedSelected.has(value)) {
      updatedSelected.delete(value);
    } else {
      updatedSelected.add(value);
    }
    setSelectedServers(updatedSelected);
    onChange(Array.from(updatedSelected));
  };

  const hasSelectedServers = selectedServers.size > 0;

  const getDisplayName = (value: string, index: number): string => {
    return enumNames[index] || value;
  };

  return (
    <Box>
      <Typography className={classes.title}>{customTitle}</Typography>

      <Grid container spacing={2} className={classes.cardsContainer}>
        {enumValues.map((value: string, index: number) => {
          const isSelected = selectedServers.has(value);
          const displayName = getDisplayName(value, index);
          return (
            <Grid item xs={12} sm={6} md={6} key={value}>
              <Paper
                className={`${classes.card} ${
                  isSelected ? classes.cardSelected : ''
                }`}
                elevation={isSelected ? 2 : 0}
                onClick={() => handleCardClick(value)}
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardClick(value);
                  }
                }}
                aria-pressed={isSelected}
                aria-label={`${isSelected ? 'Deselect' : 'Select'} ${displayName}`}
              >
                <Box className={classes.cardContent}>
                  <Box
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flex: 1,
                    }}
                  >
                    {(() => {
                      const IconComponent = getIconForEnum(value);
                      return <IconComponent className={classes.cardIcon} />;
                    })()}
                    <Typography className={classes.cardText}>
                      {displayName}
                    </Typography>
                  </Box>
                  {isSelected && (
                    <CheckCircleIcon className={classes.checkIcon} />
                  )}
                </Box>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {hasSelectedServers && (
        <Box className={classes.noteBox}>
          <InfoIcon className={classes.noteIcon} />
          <Typography className={classes.noteText}>
            Update the 'mcp-vars.yaml' file if you want to override the default
            variables for the MCP servers selected for installation.
          </Typography>
        </Box>
      )}

      {rawErrors.length > 0 && (
        <Typography
          color="error"
          variant="caption"
          style={{ marginTop: '8px', display: 'block' }}
        >
          {rawErrors.join(', ')}
        </Typography>
      )}
    </Box>
  );
};
