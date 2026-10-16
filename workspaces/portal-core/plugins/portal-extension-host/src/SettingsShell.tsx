import { useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { JSONSchema7 } from 'json-schema';
import Form from '@rjsf/core';
import type { IChangeEvent } from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import {
  Button,
  CircularProgress,
  Typography,
  makeStyles,
} from '@material-ui/core';
import { useApi, alertApiRef } from '@backstage/core-plugin-api';

// ── Styles ────────────────────────────────────────────────────────────────────

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(2, 0),
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(1),
    marginTop: theme.spacing(2),
    alignItems: 'center',
  },
  progress: {
    marginLeft: theme.spacing(1),
  },
}));

// ── Types ─────────────────────────────────────────────────────────────────────

/** Callback invoked when SettingsShell mounts to load the current settings. */
export type SettingsLoader<T extends Record<string, unknown>> =
  () => Promise<T>;

/** Callback invoked on save with the validated form data. */
export type SettingsSaver<T extends Record<string, unknown>> = (
  data: T,
) => Promise<void>;

export interface SettingsShellProps<T extends Record<string, unknown>> {
  /**
   * JSON Schema (draft-07) describing the settings object.
   * RJSF uses this to render the form and validate user input.
   */
  schema: JSONSchema7;

  /**
   * Optional RJSF uiSchema for custom widget configuration, ordering,
   * help text, and disabled fields. Follows the standard RJSF uiSchema format.
   *
   * @example
   * ```ts
   * const uiSchema = {
   *   apiToken: { 'ui:widget': 'password' },
   *   'ui:order': ['name', 'apiToken', '*'],
   * };
   * ```
   */
  uiSchema?: Record<string, unknown>;

  /**
   * Called when the shell mounts to fetch the current settings values.
   * The returned object is used as the form's initial `formData`.
   */
  onLoad: SettingsLoader<T>;

  /**
   * Called with validated form data when the user clicks Save.
   * Throw to signal a save failure — the shell will display the error
   * via Backstage's `alertApiRef`.
   */
  onSave: SettingsSaver<T>;

  /**
   * Optional extra content rendered below the form (e.g. a preview panel
   * or a link to documentation).
   */
  children?: ReactNode;

  /** Label for the save button (default: "Save"). */
  saveLabel?: string;

  /** Label for the reset button (default: "Reset to saved"). */
  resetLabel?: string;

  /** If true, the Save button and form fields are disabled. */
  readOnly?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * A generic settings form shell backed by React JSON Schema Form (RJSF).
 *
 * Portal plugins contribute a `SettingsContribution` via the `ContributionRegistry`.
 * The host renders each contribution's settings page as a `<SettingsShell>`,
 * passing the plugin-provided `schema`, `uiSchema`, `onLoad`, and `onSave` callbacks.
 *
 * **Lifecycle**
 * 1. On mount: calls `onLoad()` to populate the form with saved values.
 * 2. On edit: RJSF validates in real time against `schema`.
 * 3. On Save: calls `onSave(data)` with the validated form data.
 * 4. On "Reset to saved": re-calls `onLoad()` to discard local edits.
 *
 * **Usage in a plugin's SettingsContribution**
 * ```ts
 * // In your portal plugin's settings page component:
 * export const MyPluginSettings = () => (
 *   <SettingsShell
 *     schema={myJsonSchema}
 *     uiSchema={{ apiToken: { 'ui:widget': 'password' } }}
 *     onLoad={async () => myApi.getSettings()}
 *     onSave={async data => myApi.saveSettings(data)}
 *   />
 * );
 * ```
 *
 * **Extending the form**
 *
 * Pass custom RJSF widgets and fields via the `uiSchema` prop. For more advanced
 * customisation (custom field components, array items, etc.) wrap `SettingsShell`
 * in your own component and compose from the lower-level RJSF primitives.
 */
export function SettingsShell<T extends Record<string, unknown>>({
  schema,
  uiSchema,
  onLoad,
  onSave,
  children,
  saveLabel = 'Save',
  resetLabel = 'Reset to saved',
  readOnly = false,
}: SettingsShellProps<T>) {
  const classes = useStyles();
  const alertApi = useApi(alertApiRef);

  const [formData, setFormData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<Error | null>(null);

  // Load on mount
  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await onLoad();
      setFormData(data);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err : new Error('Failed to load settings'),
      );
    } finally {
      setLoading(false);
    }
  }, [onLoad]);

  // Trigger load on first render
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleChange = useCallback((evt: IChangeEvent<T>) => {
    setFormData(evt.formData);
  }, []);

  const handleSubmit = useCallback(
    async (evt: IChangeEvent<T>) => {
      if (!evt.formData || readOnly) return;
      setSaving(true);
      try {
        await onSave(evt.formData);
        alertApi.post({ message: 'Settings saved.', severity: 'success' });
      } catch (err) {
        alertApi.post({
          message:
            err instanceof Error ? err.message : 'Failed to save settings.',
          severity: 'error',
        });
      } finally {
        setSaving(false);
      }
    },
    [onSave, readOnly, alertApi],
  );

  if (loading) {
    return (
      <CircularProgress
        size={24}
        style={{ display: 'block', margin: '24px auto' }}
        aria-label="Loading settings"
      />
    );
  }

  if (loadError) {
    return (
      <Typography color="error" variant="body2">
        Failed to load settings: {loadError.message}
      </Typography>
    );
  }

  return (
    <div className={classes.root}>
      {/* Form is typed as any to avoid RJSF validator generic variance issues */}
      <Form<any>
        schema={schema as any}
        uiSchema={uiSchema as any}
        formData={formData}
        validator={validator as any}
        onChange={handleChange as any}
        onSubmit={handleSubmit as any}
        disabled={readOnly || saving}
      >
        {/* Custom action bar — suppresses RJSF's default Submit button */}
        <div className={classes.actions}>
          <Button
            variant="contained"
            color="primary"
            type="submit"
            disabled={readOnly || saving}
            aria-label={saveLabel}
          >
            {saveLabel}
            {saving && (
              <CircularProgress
                size={16}
                className={classes.progress}
                aria-label="Saving"
              />
            )}
          </Button>
          <Button
            variant="outlined"
            onClick={loadSettings}
            disabled={saving}
            aria-label={resetLabel}
          >
            {resetLabel}
          </Button>
        </div>
      </Form>

      {children}
    </div>
  );
}
