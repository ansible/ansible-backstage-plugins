import { useState, useEffect, useCallback, useRef, ChangeEvent } from 'react';
import {
  FieldExtensionComponentProps,
  useTemplateSecrets,
} from '@backstage/plugin-scaffolder-react';
import { scmAuthApiRef } from '@backstage/integration-react';
import { useApi } from '@backstage/core-plugin-api';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  CircularProgress,
  Box,
  Typography,
  Chip,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';

interface ScmAuthPickerOptions {
  requestUserCredentials?: {
    secretsKey: string;
    additionalScopes?: {
      github?: string[];
      gitlab?: string[];
    };
  };
  hostMapping?: Record<string, string>;
}

const useStyles = makeStyles(theme => ({
  formControl: {
    minWidth: 200,
    width: '100%',
  },
  selectContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  statusChip: {
    marginLeft: theme.spacing(1),
  },
  authStatus: {
    display: 'flex',
    alignItems: 'center',
    marginTop: theme.spacing(1),
    gap: theme.spacing(0.5),
  },
  successIcon: {
    color: theme.palette.success.main,
    fontSize: '1rem',
  },
  errorIcon: {
    color: theme.palette.error.main,
    fontSize: '1rem',
  },
  statusText: {
    fontSize: '0.75rem',
  },
}));

export const ScmAuthPickerExtension = ({
  onChange,
  required,
  disabled,
  rawErrors = [],
  schema,
  uiSchema,
  formData,
}: FieldExtensionComponentProps<string>) => {
  const classes = useStyles();
  const scmAuthApi = useApi(scmAuthApiRef);
  const { setSecrets } = useTemplateSecrets();

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const hasInitializedRef = useRef(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const options = (uiSchema?.['ui:options'] as ScmAuthPickerOptions) || {};
  const { requestUserCredentials, hostMapping } = options;

  const title = schema?.title || 'Source Control Provider';
  const description = schema?.description;
  const enumValues: string[] = (schema?.enum || []).map(String);
  const enumNames: string[] = (schema?.enumNames || enumValues).map(String);

  const getHostForValue = useCallback(
    (value: string): string => {
      if (hostMapping?.[value]) {
        return hostMapping[value];
      }
      const lowerValue = value.toLowerCase();
      if (lowerValue.includes('github')) {
        return 'github.com';
      }
      if (lowerValue.includes('gitlab')) {
        return 'gitlab.com';
      }
      return value;
    },
    [hostMapping],
  );

  const authenticateWithProvider = useCallback(
    async (providerValue: string) => {
      if (!requestUserCredentials) {
        return;
      }

      setIsAuthenticating(true);
      setAuthError(null);
      setIsAuthenticated(false);

      try {
        const host = getHostForValue(providerValue);
        const url = `https://${host}`;

        const additionalScope: {
          repoWrite?: boolean;
          customScopes?: { github?: string[]; gitlab?: string[] };
        } = {
          repoWrite: true,
        };

        if (requestUserCredentials.additionalScopes) {
          additionalScope.customScopes =
            requestUserCredentials.additionalScopes;
        }

        // mark OAuth as pending before the auth flow in case page reloads
        try {
          sessionStorage.setItem('scaffolder-oauth-pending', 'true');
        } catch {
          // Ignore storage errors
        }

        const { token } = await scmAuthApi.getCredentials({
          url,
          additionalScope,
        });

        // clear OAuth pending flag after authentication is successful
        try {
          sessionStorage.removeItem('scaffolder-oauth-pending');
        } catch {
          // silently ignore storage errors
        }

        if (token) {
          setSecrets({ [requestUserCredentials.secretsKey]: token });
          setIsAuthenticated(true);
        } else {
          throw new Error('No token received from authentication');
        }
      } catch (error) {
        try {
          sessionStorage.removeItem('scaffolder-oauth-pending');
        } catch {
          // silently ignore storage errors
        }

        const errorMessage =
          error instanceof Error ? error.message : 'Authentication failed';
        setAuthError(errorMessage);
        setIsAuthenticated(false);
      } finally {
        setIsAuthenticating(false);
      }
    },
    [scmAuthApi, setSecrets, requestUserCredentials, getHostForValue],
  );

  const handleChange = useCallback(
    async (event: ChangeEvent<{ value: unknown }>) => {
      const value = event.target.value as string;
      onChange(value);

      if (value && requestUserCredentials) {
        await authenticateWithProvider(value);
      }
    },
    [onChange, requestUserCredentials, authenticateWithProvider],
  );

  useEffect(() => {
    if (
      !hasInitializedRef.current &&
      formData &&
      requestUserCredentials &&
      !isAuthenticated &&
      !isAuthenticating
    ) {
      hasInitializedRef.current = true;
      authenticateWithProvider(formData);
    }
  }, [
    formData,
    requestUserCredentials,
    isAuthenticated,
    isAuthenticating,
    authenticateWithProvider,
  ]);

  const renderAuthStatus = () => {
    if (!requestUserCredentials) {
      return null;
    }

    if (isAuthenticating) {
      return (
        <Box className={classes.authStatus}>
          <CircularProgress size={14} />
          <Typography className={classes.statusText} color="textSecondary">
            Authenticating...
          </Typography>
        </Box>
      );
    }

    if (authError) {
      return (
        <Box className={classes.authStatus}>
          <ErrorIcon className={classes.errorIcon} />
          <Typography className={classes.statusText} color="error">
            {authError}
          </Typography>
        </Box>
      );
    }

    if (isAuthenticated && formData) {
      return (
        <Box className={classes.authStatus}>
          <CheckCircleIcon className={classes.successIcon} />
          <Typography
            className={classes.statusText}
            style={{ color: '#4caf50' }}
          >
            Authenticated with {getHostForValue(formData)}
          </Typography>
        </Box>
      );
    }

    return null;
  };

  return (
    <Box>
      <FormControl
        className={classes.formControl}
        required={required}
        error={rawErrors.length > 0 || !!authError}
        disabled={disabled || isAuthenticating}
        variant="outlined"
      >
        <InputLabel id="scm-auth-picker-label" shrink={!!formData}>
          {title}
        </InputLabel>
        <Box className={classes.selectContainer}>
          <Select
            labelId="scm-auth-picker-label"
            label={title}
            value={formData || ''}
            onChange={handleChange}
            style={{ flex: 1 }}
          >
            {enumValues.map((value, index) => (
              <MenuItem key={value} value={value}>
                {enumNames[index] || value}
                {isAuthenticated && formData === value && (
                  <Chip
                    size="small"
                    label="Authenticated"
                    color="primary"
                    className={classes.statusChip}
                    icon={<CheckCircleIcon style={{ fontSize: '0.9rem' }} />}
                  />
                )}
              </MenuItem>
            ))}
          </Select>
          {isAuthenticating && <CircularProgress size={20} />}
        </Box>
        {description && <FormHelperText>{description}</FormHelperText>}
        {rawErrors.length > 0 && (
          <FormHelperText error>{rawErrors.join(', ')}</FormHelperText>
        )}
      </FormControl>
      {renderAuthStatus()}
    </Box>
  );
};
