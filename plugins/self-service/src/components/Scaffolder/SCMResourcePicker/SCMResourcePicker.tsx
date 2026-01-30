import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  scaffolderApiRef,
  ScaffolderRJSFFieldProps,
} from '@backstage/plugin-scaffolder-react';

import FormControl from '@material-ui/core/FormControl';
import FormHelperText from '@material-ui/core/FormHelperText';

import {
  CircularProgress,
  InputLabel,
  makeStyles,
  MenuItem,
  Select,
  Typography,
} from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  formControl: {
    margin: theme.spacing(1),
    minWidth: 120,
    maxWidth: 300,
  },
  noLabel: {
    marginTop: theme.spacing(3),
  },
  menuItemContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    width: '100%',
  },
  typeLabel: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    textTransform: 'capitalize',
  },
}));

/** SCM Integration resource shape returned from autocomplete */
interface SCMIntegration {
  id: string;
  host: string;
  type: 'github' | 'gitlab';
  name: string;
}

/**
 * SCMResourcePicker - A scaffolder field extension for selecting configured
 * GitHub or GitLab integration hosts.
 *
 * Unlike AAPResourcePicker, this component does NOT require AAP authentication
 * as SCM integrations are server-side configuration.
 */
export const SCMResourcePicker = (props: ScaffolderRJSFFieldProps) => {
  const {
    name,
    rawErrors = [],
    errors,
    help,
    required,
    disabled,
    schema: { description, title },
    formData,
    onChange,
  } = props;

  const scaffolderApi = useApi(scaffolderApiRef);
  const [availableHosts, setAvailableHosts] = useState<SCMIntegration[]>([]);
  const [selected, setSelected] = useState<string>(formData?.host || '');
  const [loading, setLoading] = useState<boolean>(false);
  const classes = useStyles();

  const updateAvailableHosts = useCallback(() => {
    if (scaffolderApi.autocomplete) {
      setLoading(true);
      scaffolderApi
        .autocomplete({
          token: '', // No token needed for SCM integrations
          resource: 'scm_integrations',
          provider: 'aap-api-cloud',
          context: {},
        })
        .then(({ results }) => {
          setAvailableHosts(results as SCMIntegration[]);
          setLoading(false);

          // If formData has a host, ensure it's selected
          if (formData?.host) {
            setSelected(formData.host);
          }
          // Auto-select if only one host is available
          else if (results.length === 1) {
            const singleHost = results[0] as SCMIntegration;
            setSelected(singleHost.host);
            onChange(singleHost);
          }
        })
        .catch(() => {
          setAvailableHosts([]);
          setLoading(false);
        });
    } else {
      setAvailableHosts([]);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaffolderApi]);

  useEffect(updateAvailableHosts, [updateAvailableHosts]);

  function handleChange(event: React.ChangeEvent<{ value: unknown }>) {
    const hostValue = event.target.value as string;
    const selectedHost = availableHosts.find(h => h.host === hostValue);
    setSelected(hostValue);
    onChange(selectedHost);
  }

  const renderValue = (value: unknown) => {
    const host = availableHosts.find(h => h.host === value);
    return host ? host.name : '';
  };

  return (
    <FormControl
      fullWidth
      error={!!rawErrors.length}
      required={required}
      disabled={disabled}
    >
      <InputLabel id={`${name}-select-label`}>
        {title ?? 'Source Control Host'}&nbsp;
        {loading && <CircularProgress size={12} />}
      </InputLabel>
      <Select
        placeholder={title ?? 'Source Control Host'}
        labelId={`${name}-select-label`}
        label={title ?? 'Source Control Host'}
        onChange={handleChange}
        value={selected}
        renderValue={renderValue}
      >
        {availableHosts.length > 0 ? (
          availableHosts.map(host => (
            <MenuItem key={host.id} value={host.host}>
              <div className={classes.menuItemContent}>
                <Typography>
                  <span style={{ fontWeight: 450 }}>{host.name}</span>
                </Typography>
                <span className={classes.typeLabel}>{host.type}</span>
              </div>
            </MenuItem>
          ))
        ) : (
          <MenuItem value="" disabled>
            {loading ? 'Loading...' : 'No SCM integrations found'}
          </MenuItem>
        )}
      </Select>
      {errors}
      <FormHelperText>{description}</FormHelperText>
      <FormHelperText>{help}</FormHelperText>
    </FormControl>
  );
};
