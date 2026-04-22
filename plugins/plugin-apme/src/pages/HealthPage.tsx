import React from 'react';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { Content, ContentHeader, Progress, WarningPanel, StatusOK, StatusError } from '@backstage/core-components';
import { List, ListItem, ListItemText, ListItemIcon } from '@material-ui/core';
import { apmeApiRef } from '../api/ApmeApi';

export const HealthPage = () => {
  const api = useApi(apmeApiRef);
  const { value: health, loading, error } = useAsync(() => api.getHealth());

  if (loading) return <Progress />;
  if (error) return <WarningPanel title="Failed to load health">{error.message}</WarningPanel>;

  return (
    <Content>
      <ContentHeader title="System Health" />
      <List>
        <ListItem>
          <ListItemIcon>{health?.status === 'ok' ? <StatusOK /> : <StatusError />}</ListItemIcon>
          <ListItemText primary="Gateway" secondary={`Status: ${health?.status}`} />
        </ListItem>
        <ListItem>
          <ListItemIcon>{health?.database === 'ok' ? <StatusOK /> : <StatusError />}</ListItemIcon>
          <ListItemText primary="Database" secondary={`Status: ${health?.database}`} />
        </ListItem>
        {health?.components?.map(c => (
          <ListItem key={c.name}>
            <ListItemIcon>{c.status === 'ok' ? <StatusOK /> : <StatusError />}</ListItemIcon>
            <ListItemText primary={c.name} secondary={`${c.address} — ${c.status}`} />
          </ListItem>
        ))}
      </List>
    </Content>
  );
};
