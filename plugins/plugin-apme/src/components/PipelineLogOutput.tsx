import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Collapse,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import type { LogEntry } from '../types/api';

interface Props {
  logs: LogEntry[];
}

export const PipelineLogOutput = ({ logs }: Props) => {
  const [expanded, setExpanded] = useState(false);

  if (!logs || logs.length === 0) return null;

  return (
    <Card variant="outlined">
      <CardContent style={{ paddingBottom: 8 }}>
        <Box
          display="flex"
          alignItems="center"
          style={{ cursor: 'pointer' }}
          onClick={() => setExpanded(!expanded)}
        >
          <Typography variant="subtitle2" style={{ flex: 1 }}>
            Pipeline Logs ({logs.length})
          </Typography>
          <IconButton size="small">
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>
        <Collapse in={expanded}>
          <List dense style={{ maxHeight: 300, overflow: 'auto' }}>
            {logs.map(log => (
              <ListItem key={log.id}>
                <ListItemText
                  primary={log.message}
                  secondary={`${log.phase} — progress: ${log.progress}%`}
                />
              </ListItem>
            ))}
          </List>
        </Collapse>
      </CardContent>
    </Card>
  );
};
