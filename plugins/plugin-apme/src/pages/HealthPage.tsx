import React from 'react';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import {
  ContentHeader,
  Progress,
  WarningPanel,
  StatusOK,
  StatusError,
} from '@backstage/core-components';
import {
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Typography,
  Divider,
  Box,
} from '@material-ui/core';
import { apmeApiRef } from '../api/ApmeApi';
import type { ComponentHealth, HealthStatus } from '../types/api';

const okColor = '#2e7d32';
const errColor = '#c62828';

function gatewayOk(h: HealthStatus | undefined): boolean {
  return h?.status === 'ok';
}

function databaseOk(h: HealthStatus | undefined): boolean {
  return h?.database === 'ok';
}

function componentOk(c: ComponentHealth): boolean {
  return c.status === 'ok';
}

export const HealthPage = () => {
  const api = useApi(apmeApiRef);
  const { value: health, loading, error } = useAsync(() => api.getHealth());

  if (loading) return <Progress />;
  if (error)
    return (
      <WarningPanel title="Failed to load health">{error.message}</WarningPanel>
    );

  return (
    <>
      <ContentHeader title="System Health" />
      <List>
        <ListItem>
          <ListItemIcon>
            {gatewayOk(health) ? <StatusOK /> : <StatusError />}
          </ListItemIcon>
          <ListItemText
            primary="Gateway"
            primaryTypographyProps={{
              style: {
                color: gatewayOk(health) ? okColor : errColor,
                fontWeight: 600,
              },
            }}
            secondary={
              <Typography
                component="span"
                variant="body2"
                style={{ color: gatewayOk(health) ? okColor : errColor }}
              >
                {`Status: ${health?.status ?? 'unknown'}`}
              </Typography>
            }
          />
        </ListItem>
        <ListItem>
          <ListItemIcon>
            {databaseOk(health) ? <StatusOK /> : <StatusError />}
          </ListItemIcon>
          <ListItemText
            primary="Database"
            primaryTypographyProps={{
              style: {
                color: databaseOk(health) ? okColor : errColor,
                fontWeight: 600,
              },
            }}
            secondary={
              <Typography
                component="span"
                variant="body2"
                style={{ color: databaseOk(health) ? okColor : errColor }}
              >
                {`Status: ${health?.database ?? 'unknown'}`}
              </Typography>
            }
          />
        </ListItem>
        {health?.components && health.components.length > 0 && (
          <>
            <ListSubheader component="li" disableSticky>
              <Typography variant="subtitle2" color="textSecondary">
                Components
              </Typography>
            </ListSubheader>
            <Divider component="li" />
            {health.components.map(c => (
              <ListItem key={c.name} alignItems="flex-start">
                <ListItemIcon>
                  {componentOk(c) ? <StatusOK /> : <StatusError />}
                </ListItemIcon>
                <ListItemText
                  primary={c.name}
                  primaryTypographyProps={{
                    style: {
                      color: componentOk(c) ? okColor : errColor,
                      fontWeight: 500,
                    },
                  }}
                  secondary={
                    <Box
                      display="flex"
                      flexDirection="column"
                      style={{ gap: 4 }}
                    >
                      <Typography
                        variant="body2"
                        color="textPrimary"
                        style={{ wordBreak: 'break-all' }}
                      >
                        {c.address}
                      </Typography>
                      <Typography
                        component="span"
                        variant="caption"
                        style={{
                          color: componentOk(c) ? okColor : errColor,
                          fontWeight: 600,
                        }}
                      >
                        {c.status}
                      </Typography>
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </>
        )}
      </List>
    </>
  );
};
