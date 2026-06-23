import { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  FieldExtensionComponentProps,
  useTemplateSecrets,
} from '@backstage/plugin-scaffolder-react';
import {
  TextField,
  CircularProgress,
  Typography,
  Box,
} from '@material-ui/core';

import { rhAapAuthApiRef } from '../../../apis';

export const AAPTokenField = ({
  onChange,
  required,
  disabled,
  rawErrors = [],
  schema,
  uiSchema,
}: FieldExtensionComponentProps<string>) => {
  const aapAuth = useApi(rhAapAuthApiRef);
  const { setSecrets } = useTemplateSecrets();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenReceived, setTokenReceived] = useState(false);

  const customTitle = uiSchema?.['ui:options']?.title;
  const fieldName =
    (typeof customTitle === 'string' ? customTitle : schema?.title) ||
    'AAP Token';
  const fieldId = `aap-token-field-${Math.random().toString(36).substring(2, 11)}`;

  useEffect(() => {
    const fetchToken = async () => {
      try {
        setLoading(true);
        setError(null);

        const token = await aapAuth.getAccessToken();

        // Store the actual token in secrets context
        setSecrets({ aapToken: token });

        // Set masked value in form data for display
        const maskedToken = new Array(token.length).fill('*').join('');
        onChange(maskedToken);

        setTokenReceived(true);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch AAP token';
        setError(errorMessage);
        onChange(''); // Clear any existing value on error
      } finally {
        setLoading(false);
      }
    };

    fetchToken();
  }, [aapAuth, onChange, setSecrets]);

  const getHelperText = () => {
    if (loading) return 'Fetching AAP authentication token...';
    if (error) return `Error: ${error}`;
    if (tokenReceived) {
      const customHelperText = uiSchema?.['ui:options']?.helperText;
      return typeof customHelperText === 'string'
        ? customHelperText
        : 'AAP token retrieved and secured.';
    }
    return 'AAP authentication token will be fetched automatically.';
  };

  const getDisplayValue = () => {
    if (loading) return '';
    if (error) return '';
    if (tokenReceived) return '••••••••••••••••'; // Fixed-length masked display
    return '';
  };

  return (
    <Box display="flex" alignItems="center">
      <Box flexGrow={1} marginRight={1}>
        <TextField
          id={fieldId}
          label={fieldName}
          value={getDisplayValue()}
          type="password"
          autoComplete="off"
          required={required}
          disabled={disabled || loading}
          error={!!error || rawErrors.length > 0}
          helperText={getHelperText()}
          fullWidth
          InputProps={{
            readOnly: true, // Token is fetched automatically, not user input
          }}
          InputLabelProps={{
            htmlFor: fieldId,
          }}
        />
      </Box>
      {loading && <CircularProgress size={20} />}
      {error && (
        <Typography variant="caption" color="error">
          ⚠️
        </Typography>
      )}
      {tokenReceived && (
        <Typography variant="caption" color="primary">
          ✓
        </Typography>
      )}
    </Box>
  );
};
