/*
 * Copyright Red Hat
 *
 * Thin Quality settings for Git Repositories (US-004): global ansible-core
 * scan target via portal settings store. AI gate remains app-config only.
 */

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
  makeStyles,
} from '@material-ui/core';
import { Progress } from '@backstage/core-components';
import { ansibleCoreVersionOptions } from '@ansible/backstage-apme-common/ansibleCoreVersionOptions';
import { DEFAULT_APME_TARGET_ANSIBLE_CORE_VERSION } from '@ansible/backstage-apme-common/scanTargetDefaults';
import { apmeApiRef } from '../../api';

const useStyles = makeStyles(theme => ({
  root: {
    maxWidth: 640,
  },
  field: {
    minWidth: 220,
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(2),
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginTop: theme.spacing(1),
  },
  hint: {
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(2),
  },
  meta: {
    marginTop: theme.spacing(2),
    color: theme.palette.text.secondary,
  },
  error: {
    color: theme.palette.error.main,
    marginBottom: theme.spacing(2),
  },
}));

/**
 * Git Repositories page tab: edit global Quality scan defaults.
 */
export const ApmeQualitySettingsTab = () => {
  const classes = useStyles();
  const apmeApi = useApi(apmeApiRef);
  const options = ansibleCoreVersionOptions();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | undefined>();
  const [savedMessage, setSavedMessage] = useState<string | undefined>();
  const [version, setVersion] = useState(DEFAULT_APME_TARGET_ANSIBLE_CORE_VERSION);
  const [enableAi, setEnableAi] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    setSavedMessage(undefined);
    try {
      const settings = await apmeApi.getPortalSettings();
      setVersion(
        settings.targetAnsibleCoreVersion?.trim() ||
          DEFAULT_APME_TARGET_ANSIBLE_CORE_VERSION,
      );
      setEnableAi(Boolean(settings.enableAi));
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [apmeApi]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async () => {
    setSaving(true);
    setError(undefined);
    setSavedMessage(undefined);
    try {
      const settings = await apmeApi.updatePortalSettings({
        targetAnsibleCoreVersion: version,
      });
      setVersion(
        settings.targetAnsibleCoreVersion?.trim() ||
          DEFAULT_APME_TARGET_ANSIBLE_CORE_VERSION,
      );
      setEnableAi(Boolean(settings.enableAi));
      setDirty(false);
      setSavedMessage('Quality defaults saved.');
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Progress />;
  }

  return (
    <Box className={classes.root}>
      <Card>
        <CardHeader
          title="Quality settings"
          subheader="Defaults for Quality scans across registered repositories"
        />
        <CardContent>
          <Typography variant="body2" className={classes.hint}>
            Sets the global ansible-core target used when a repository has no
            per-project override. Changes persist in the Portal settings store.
          </Typography>

          {error && (
            <Typography
              variant="body2"
              className={classes.error}
              role="alert"
            >
              {error.message}
            </Typography>
          )}

          <FormControl variant="outlined" className={classes.field} size="small">
            <InputLabel id="apme-target-ansible-core-label">
              Target ansible-core
            </InputLabel>
            <Select
              labelId="apme-target-ansible-core-label"
              label="Target ansible-core"
              value={version}
              onChange={event => {
                setVersion(String(event.target.value));
                setDirty(true);
                setSavedMessage(undefined);
              }}
              disabled={saving}
            >
              {options.map(option => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box className={classes.actions}>
            <Button
              color="primary"
              variant="contained"
              onClick={() => void onSave()}
              disabled={saving || !dirty}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
            {savedMessage && (
              <Typography variant="body2" color="primary">
                {savedMessage}
              </Typography>
            )}
          </Box>

          <Typography variant="body2" className={classes.meta}>
            AI-assisted remediation: {enableAi ? 'enabled' : 'disabled'}{' '}
            (app-config <code>ansible.apme.enableAi</code>; not editable here).
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};
