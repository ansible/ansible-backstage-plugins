import React, { useEffect, useState } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { useApi } from '@backstage/core-plugin-api';
import { apmeApiRef } from '../api/ApmeApi';
import type { AiModelInfo } from '../types/api';

export const AI_MODEL_STORAGE_KEY = 'apme-ai-model';

export interface CheckOptionsFormProps {
  ansibleVersion: string;
  onAnsibleVersionChange: (value: string) => void;
  collections: string;
  onCollectionsChange: (value: string) => void;
  enableAi: boolean;
  onEnableAiChange: (checked: boolean) => void;
}

export const CheckOptionsForm = ({
  ansibleVersion,
  onAnsibleVersionChange,
  collections,
  onCollectionsChange,
  enableAi,
  onEnableAiChange,
}: CheckOptionsFormProps) => {
  const api = useApi(apmeApiRef);
  const [models, setModels] = useState<AiModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem(AI_MODEL_STORAGE_KEY) ?? '',
  );

  useEffect(() => {
    api
      .listAiModels()
      .then(m => {
        setModels(m);
        const stored = localStorage.getItem(AI_MODEL_STORAGE_KEY);
        if (stored && m.some(x => x.id === stored)) {
          setSelectedModel(stored);
        } else if (m.length > 0) {
          setSelectedModel(m[0].id);
          localStorage.setItem(AI_MODEL_STORAGE_KEY, m[0].id);
        }
      })
      .catch(() => setModels([]));
  }, [api]);

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2">Advanced Options</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Box
          display="flex"
          flexDirection="column"
          style={{ gap: 16, width: '100%' }}
        >
          <TextField
            label="Ansible Core Version"
            value={ansibleVersion}
            onChange={e => onAnsibleVersionChange(e.target.value)}
            size="small"
            placeholder="e.g. 2.16"
          />
          <TextField
            label="Collections (comma-separated)"
            value={collections}
            onChange={e => onCollectionsChange(e.target.value)}
            size="small"
            placeholder="e.g. ansible.posix, community.general"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={enableAi}
                onChange={(_e, checked) => onEnableAiChange(checked)}
              />
            }
            label="Enable AI-assisted remediation (Tier 2)"
          />
          {enableAi && (
            <FormControl size="small">
              <InputLabel>AI Model</InputLabel>
              <Select
                value={selectedModel}
                onChange={e => {
                  const v = e.target.value as string;
                  setSelectedModel(v);
                  localStorage.setItem(AI_MODEL_STORAGE_KEY, v);
                }}
                label="AI Model"
              >
                {models.map(m => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.name || m.id} ({m.provider})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};
