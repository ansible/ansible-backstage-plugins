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
  TextField,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { Alert } from '@material-ui/lab';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import { useFieldValidation } from '../../CreateTask/FieldValidationContext';

type ProviderType = 'github' | 'gitlab';

interface ProviderConfig {
  label: string;
  provider: ProviderType;
  host?: string;
  apiBaseUrl?: string;
}

interface ScmSelectorOptions {
  providers?: ProviderConfig[];
  requestUserCredentials?: {
    secretsKey: string;
    additionalScopes?: {
      github?: string[];
      gitlab?: string[];
    };
  };
}

export interface ScmSelectorData {
  provider: string;
  providerLabel: string;
  org: string;
  repoName: string;
  repoExists: boolean;
}

interface OrgItem {
  id: string;
  name: string;
  displayName: string;
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
  successText: {
    fontSize: '0.75rem',
    color: theme.palette.success.main,
  },
  sectionSpacing: {
    marginTop: theme.spacing(2),
  },
  alertSpacing: {
    marginTop: theme.spacing(1),
  },
  flexGrow: {
    flex: 1,
  },
  validationTooltip: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    width: 'fit-content',
    marginLeft: 'auto',
    marginRight: 'auto',
    marginTop: theme.spacing(1),
    backgroundColor: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.shadows[3],
    padding: theme.spacing(0.75, 1.5),
    '&::before': {
      content: '""',
      position: 'absolute',
      top: -9,
      left: 14,
      borderLeft: '7px solid transparent',
      borderRight: '7px solid transparent',
      borderBottom: '9px solid #e0e0e0',
    },
    '&::after': {
      content: '""',
      position: 'absolute',
      top: -7,
      left: 15,
      borderLeft: '6px solid transparent',
      borderRight: '6px solid transparent',
      borderBottom: '8px solid #fff',
    },
  },
  validationIconBox: {
    backgroundColor: '#f57c00',
    color: '#fff',
    borderRadius: '3px',
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '0.85rem',
    flexShrink: 0,
  },
  validationTooltipText: {
    fontSize: '0.875rem',
    color: 'rgba(0, 0, 0, 0.87)',
  },
}));

export const ScmSelectorExtension = ({
  onChange,
  required,
  disabled,
  rawErrors = [],
  schema,
  uiSchema,
  formData,
  idSchema,
}: FieldExtensionComponentProps<ScmSelectorData>) => {
  const classes = useStyles();
  const scmAuthApi = useApi(scmAuthApiRef);
  const { setSecrets } = useTemplateSecrets();

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const hasInitializedRef = useRef(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [organizations, setOrganizations] = useState<OrgItem[]>([]);
  const [isFetchingOrgs, setIsFetchingOrgs] = useState(false);
  const [repoStatus, setRepoStatus] = useState<
    'checking' | 'available' | 'exists' | 'error' | null
  >(null);
  const tokenRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const options = (uiSchema?.['ui:options'] as ScmSelectorOptions) || {};
  const { requestUserCredentials, providers = [] } = options;

  const selectedProvider = formData?.provider ?? '';
  const providerLabel = formData?.providerLabel ?? '';
  const selectedOrg = formData?.org ?? '';
  const repoName = formData?.repoName ?? '';

  const { setFieldError, submitAttempted, resetSubmitAttempted } =
    useFieldValidation();
  const fieldId = idSchema.$id;

  const title = schema?.title || 'Source Control Provider';
  const description = schema?.description;
  const getProviderConfig = useCallback(
    (value: string): ProviderConfig | undefined =>
      providers.find(p => p.provider === value),
    [providers],
  );

  const getProviderType = useCallback(
    (value: string): ProviderType | undefined =>
      getProviderConfig(value)?.provider,
    [getProviderConfig],
  );

  const getHostForValue = useCallback(
    (value: string): string => {
      const config = getProviderConfig(value);
      if (config?.host) return config.host;
      if (config?.provider === 'github') return 'github.com';
      if (config?.provider === 'gitlab') return 'gitlab.com';
      return value;
    },
    [getProviderConfig],
  );

  const getApiBaseUrl = useCallback(
    (value: string): string => {
      const config = getProviderConfig(value);
      if (config?.apiBaseUrl) return config.apiBaseUrl;
      const host = getHostForValue(value);
      if (config?.provider === 'github') {
        return host === 'github.com'
          ? 'https://api.github.com'
          : `https://${host}/api/v3`;
      }
      return `https://${host}/api/v4`;
    },
    [getProviderConfig, getHostForValue],
  );

  const fetchOrganizations = useCallback(
    async (token: string, providerValue: string) => {
      const providerType = getProviderType(providerValue);

      if (!providerType) {
        throw new Error(
          `Unsupported provider type for "${providerValue}". Each provider must specify provider: "github" or "gitlab".`,
        );
      }

      const apiBase = getApiBaseUrl(providerValue);

      setIsFetchingOrgs(true);

      try {
        let items: OrgItem[] = [];

        if (providerType === 'github') {
          const headers = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
          };
          const [userRes, orgsRes] = await Promise.all([
            fetch(`${apiBase}/user`, { headers }),
            fetch(`${apiBase}/user/orgs?per_page=100`, { headers }),
          ]);
          if (!userRes.ok || !orgsRes.ok) {
            throw new Error('Failed to fetch GitHub namespaces');
          }
          const user: { login: string } = await userRes.json();
          const orgs: { login: string }[] = await orgsRes.json();
          items = [
            {
              id: user.login,
              name: user.login,
              displayName: `${user.login} (personal)`,
            },
            ...orgs.map(org => ({
              id: org.login,
              name: org.login,
              displayName: org.login,
            })),
          ];
        } else if (providerType === 'gitlab') {
          const headers = { Authorization: `Bearer ${token}` };
          const [userRes, groupsRes] = await Promise.all([
            fetch(`${apiBase}/user`, { headers }),
            fetch(
              `${apiBase}/groups?per_page=100&min_access_level=30&order_by=name&sort=asc`,
              { headers },
            ),
          ]);
          if (!userRes.ok || !groupsRes.ok) {
            throw new Error('Failed to fetch GitLab namespaces');
          }
          const user: { username: string } = await userRes.json();
          const groups: { full_path: string; name: string }[] =
            await groupsRes.json();
          items = [
            {
              id: user.username,
              name: user.username,
              displayName: `${user.username} (personal)`,
            },
            ...groups.map(group => ({
              id: group.full_path,
              name: group.full_path,
              displayName: group.name,
            })),
          ];
        }

        setOrganizations(items);
      } catch (err) {
        setOrganizations([]);
        setAuthError(
          err instanceof Error ? err.message : 'Failed to fetch namespaces',
        );
      } finally {
        setIsFetchingOrgs(false);
      }
    },
    [getApiBaseUrl, getProviderType],
  );

  const authenticateWithProvider = useCallback(
    async (providerValue: string) => {
      if (!requestUserCredentials) {
        return;
      }

      setIsAuthenticating(true);
      setAuthError(null);
      setIsAuthenticated(false);
      setOrganizations([]);

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

        try {
          sessionStorage.removeItem('scaffolder-oauth-pending');
        } catch {
          // silently ignore storage errors
        }

        if (token) {
          setSecrets({ [requestUserCredentials.secretsKey]: token });
          setIsAuthenticated(true);
          tokenRef.current = token;
          fetchOrganizations(token, providerValue).catch(err => {
            setAuthError(
              err instanceof Error ? err.message : 'Failed to fetch namespaces',
            );
          });
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
    [
      scmAuthApi,
      setSecrets,
      requestUserCredentials,
      getHostForValue,
      fetchOrganizations,
    ],
  );

  const handleChange = useCallback(
    async (event: ChangeEvent<{ value: unknown }>) => {
      const value = event.target.value as string;
      const config = getProviderConfig(value);
      onChange({
        provider: value,
        providerLabel: config?.label ?? value,
        org: '',
        repoName: '',
        repoExists: false,
      });
      setRepoStatus(null);

      if (value && requestUserCredentials) {
        await authenticateWithProvider(value);
      }
    },
    [
      onChange,
      requestUserCredentials,
      authenticateWithProvider,
      getProviderConfig,
    ],
  );

  const handleOrgChange = useCallback(
    (event: ChangeEvent<{ value: unknown }>) => {
      onChange({
        provider: selectedProvider,
        providerLabel,
        org: event.target.value as string,
        repoName: '',
        repoExists: false,
      });
      setRepoStatus(null);
      resetSubmitAttempted();
    },
    [onChange, selectedProvider, providerLabel, resetSubmitAttempted],
  );

  const handleRepoNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange({
        provider: selectedProvider,
        providerLabel,
        org: selectedOrg,
        repoName: event.target.value,
        repoExists: false,
      });
      setRepoStatus(null);
    },
    [onChange, selectedProvider, providerLabel, selectedOrg],
  );

  useEffect(() => {
    if (
      !hasInitializedRef.current &&
      selectedProvider &&
      requestUserCredentials &&
      !isAuthenticated &&
      !isAuthenticating
    ) {
      hasInitializedRef.current = true;
      authenticateWithProvider(selectedProvider);
    }
  }, [
    selectedProvider,
    requestUserCredentials,
    isAuthenticated,
    isAuthenticating,
    authenticateWithProvider,
  ]);

  useEffect(() => {
    let cancelled = false;

    if (
      !repoName.trim() ||
      !selectedOrg ||
      !isAuthenticated ||
      !tokenRef.current
    ) {
      setRepoStatus(null);
      return undefined;
    }

    const providerType = getProviderType(selectedProvider);
    if (!providerType) {
      setRepoStatus(null);
      return undefined;
    }

    const apiBase = getApiBaseUrl(selectedProvider);
    const token = tokenRef.current;
    const trimmed = repoName.trim();

    setRepoStatus('checking');

    const timer = setTimeout(async () => {
      try {
        let response: Response;
        if (providerType === 'github') {
          response = await fetch(
            `${apiBase}/repos/${encodeURIComponent(selectedOrg)}/${encodeURIComponent(trimmed)}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
              },
            },
          );
        } else {
          const projectPath = encodeURIComponent(`${selectedOrg}/${trimmed}`);
          response = await fetch(`${apiBase}/projects/${projectPath}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
        }

        if (cancelled) return;

        const exists = response.status === 200;
        setRepoStatus(exists ? 'exists' : 'available');
        onChangeRef.current({
          provider: selectedProvider,
          providerLabel,
          org: selectedOrg,
          repoName: trimmed,
          repoExists: exists,
        });
      } catch {
        if (!cancelled) {
          setRepoStatus('error');
        }
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    repoName,
    selectedOrg,
    selectedProvider,
    providerLabel,
    isAuthenticated,
    getProviderType,
    getApiBaseUrl,
  ]);

  useEffect(() => {
    const authErrorId = `${fieldId}-auth`;
    const orgId = `${fieldId}-org`;
    const repoId = `${fieldId}-repo`;
    const orgFieldVisible =
      isAuthenticated &&
      !!selectedProvider &&
      (isFetchingOrgs || organizations.length > 0);
    const repoFieldVisible =
      isAuthenticated && !!selectedProvider && !!selectedOrg;

    setFieldError(authErrorId, !!authError);
    setFieldError(orgId, orgFieldVisible && !selectedOrg);
    setFieldError(repoId, repoFieldVisible && !repoName.trim());

    return () => {
      setFieldError(authErrorId, false);
      setFieldError(orgId, false);
      setFieldError(repoId, false);
    };
  }, [
    fieldId,
    authError,
    isAuthenticated,
    selectedProvider,
    isFetchingOrgs,
    organizations,
    selectedOrg,
    repoName,
    setFieldError,
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

    if (isAuthenticated && selectedProvider) {
      return (
        <Box className={classes.authStatus}>
          <CheckCircleIcon className={classes.successIcon} />
          <Typography className={classes.successText}>
            Authenticated with {getHostForValue(selectedProvider)}
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
        <InputLabel id="scm-auth-picker-label" shrink={!!selectedProvider}>
          {title}
        </InputLabel>
        <Box className={classes.selectContainer}>
          <Select
            labelId="scm-auth-picker-label"
            label={title}
            value={selectedProvider}
            onChange={handleChange}
            className={classes.flexGrow}
          >
            {providers.map(p => (
              <MenuItem key={p.provider} value={p.provider}>
                {p.label}
                {isAuthenticated && selectedProvider === p.provider && (
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
      {isAuthenticated &&
        selectedProvider &&
        (isFetchingOrgs || organizations.length > 0) && (
          <>
            <FormControl
              className={`${classes.formControl} ${classes.sectionSpacing}`}
              disabled={isFetchingOrgs}
              variant="outlined"
            >
              <InputLabel id="scm-org-picker-label" shrink={!!selectedOrg}>
                Namespace
              </InputLabel>
              <Box className={classes.selectContainer}>
                <Select
                  labelId="scm-org-picker-label"
                  label="Namespace"
                  value={selectedOrg}
                  onChange={handleOrgChange}
                  className={classes.flexGrow}
                >
                  {organizations.map(org => (
                    <MenuItem key={org.id} value={org.name}>
                      {org.displayName}
                    </MenuItem>
                  ))}
                </Select>
                {isFetchingOrgs && <CircularProgress size={20} />}
              </Box>
            </FormControl>
            {submitAttempted && !selectedOrg && !isFetchingOrgs && (
              <Box className={classes.validationTooltip}>
                <Box component="span" className={classes.validationIconBox}>
                  !
                </Box>
                <Typography className={classes.validationTooltipText}>
                  Please fill in this field.
                </Typography>
              </Box>
            )}
          </>
        )}
      {isAuthenticated && selectedProvider && selectedOrg && (
        <Box className={classes.sectionSpacing}>
          <TextField
            fullWidth
            label="Repository Name"
            variant="outlined"
            value={repoName}
            onChange={handleRepoNameChange}
            InputProps={{
              endAdornment:
                repoStatus === 'checking' ? (
                  <CircularProgress size={20} />
                ) : undefined,
            }}
          />
          {submitAttempted && !repoName.trim() && (
            <Box className={classes.validationTooltip}>
              <Box component="span" className={classes.validationIconBox}>
                !
              </Box>
              <Typography className={classes.validationTooltipText}>
                Please fill in this field.
              </Typography>
            </Box>
          )}
          {repoStatus === 'available' && (
            <Box className={classes.authStatus}>
              <CheckCircleIcon className={classes.successIcon} />
              <Typography className={classes.successText}>
                {repoName.trim()} is available
              </Typography>
            </Box>
          )}
          {repoStatus === 'error' && (
            <Box className={classes.authStatus}>
              <ErrorIcon className={classes.errorIcon} />
              <Typography className={classes.statusText} color="error">
                Failed to check repository availability
              </Typography>
            </Box>
          )}
          {repoStatus === 'exists' && (
            <Alert severity="warning" className={classes.alertSpacing}>
              <Typography variant="body2">
                A repository with the name "{repoName.trim()}" already exists in
                the selected namespace. If you proceed, a{' '}
                {getProviderType(selectedProvider) === 'gitlab'
                  ? 'merge request'
                  : 'pull request'}{' '}
                will be opened.
              </Typography>
            </Alert>
          )}
        </Box>
      )}
    </Box>
  );
};
