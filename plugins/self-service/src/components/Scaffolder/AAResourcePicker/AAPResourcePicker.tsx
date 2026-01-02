import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  scaffolderApiRef,
  ScaffolderRJSFFieldProps,
} from '@backstage/plugin-scaffolder-react';

import FormControl from '@material-ui/core/FormControl';
import FormHelperText from '@material-ui/core/FormHelperText';

import {
  Chip,
  CircularProgress,
  InputLabel,
  makeStyles,
  MenuItem,
  Select,
  Typography,
} from '@material-ui/core';
import { rhAapAuthApiRef } from '../../../apis';

const useStyles = makeStyles(theme => ({
  formControl: {
    margin: theme.spacing(1),
    minWidth: 120,
    maxWidth: 300,
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
  },
  chip: {
    margin: 2,
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
}));

export const AAPResourcePicker = (props: ScaffolderRJSFFieldProps) => {
  const {
    name,
    rawErrors = [],
    errors,
    help,
    required,
    disabled,
    schema: { description, title, resource, type, idKey, nameKey },
    formData,
    onChange,
  } = props;
  const _idKey: string = idKey ?? 'id';
  const _nameKey: string = nameKey ?? 'name';
  const multiple = type === 'array';

  const getInitValue = () => {
    if (!formData) return multiple ? [] : '';
    if (typeof formData === 'string' || typeof formData === 'number') {
      return formData;
    }
    if (multiple) {
      return formData.map((item: { [x: string]: any }) => item[_idKey]);
    }
    return formData[_idKey];
  };

  const aapAuth = useApi(rhAapAuthApiRef);
  const scaffolderApi = useApi(scaffolderApiRef);
  const [availableResources, setAvailableResources] = useState<Array<Object>>(
    [],
  );

  // Store the initial formData for rendering chips before API loads
  const [initialFormData, setInitialFormData] = useState<any>(formData);

  const [selected, setSelected] = useState<
    string | number | string[] | number[]
    // @ts-ignore
  >(getInitValue);
  const [loading, setLoading] = useState<boolean>(false);
  const classes = useStyles();

  const getCredentialType = (item: any): string => {
    if (resource !== 'credentials') {
      return '';
    }
    if (item.summary_fields?.credential_type?.name) {
      return item.summary_fields.credential_type.name;
    }
    if (item.credential_type_name) {
      return item.credential_type_name;
    }
    if (item.type) {
      return item.type;
    }
    return '';
  };

  const updateAvailableResources = useCallback(() => {
    aapAuth.getAccessToken().then((token: string) => {
      if (scaffolderApi.autocomplete) {
        setLoading(true);
        scaffolderApi
          .autocomplete({
            token: token,
            resource: resource,
            provider: 'aap-api-cloud',
            context: {},
          })
          .then(({ results }) => {
            if (initialFormData) {
              const key = typeof selected === 'string' ? _nameKey : _idKey;
              const selectedArray = Array.isArray(selected)
                ? selected
                : [selected];
              const selectedIDs = results
                .filter((item: any) =>
                  selectedArray.includes(item[key] as never),
                )
                .map(item => item.id);
              setSelected(selectedIDs);
            }
            setAvailableResources(results);
            setLoading(false);
            // Clear initial form data since we now have resources loaded
            setInitialFormData(null);
          })
          .catch(() => {
            setAvailableResources([]);
            setLoading(false);
          });
      } else {
        setAvailableResources([]);
        setLoading(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aapAuth, resource, scaffolderApi]);
  useEffect(updateAvailableResources, [updateAvailableResources]);

  function change(event: any) {
    let {
      target: { value },
    } = event;
    let endValue: Object | Array<Object> | undefined;
    if (multiple) {
      value = value.map((e: any) => (e instanceof Object ? e[_idKey] : e));
      endValue = availableResources.filter((item: any) =>
        value.includes(item[_idKey]),
      );
    } else {
      // @ts-ignore
      endValue = availableResources.find(res => res[_idKey] === value);
    }
    // @ts-ignore
    setSelected(multiple ? value : endValue[_idKey]);
    onChange(endValue);
  }

  const renderSelectedValues = (values: any) => {
    let items: any[] = [];
    if (typeof values[0] === 'number') {
      items = availableResources.filter((e: any) => values.includes(e[_idKey]));
    } else {
      items = availableResources.filter((e: any) =>
        values.includes(e[_nameKey]),
      );
    }

    return (
      <div className={classes.chips}>
        {/* @ts-ignore */}
        {items.map(value => (
          <Chip
            key={value[_idKey]}
            label={String(value[_nameKey])}
            className={classes.chip}
          />
        ))}
      </div>
    );
  };

  const renderSingleValue = (value: any) => {
    const item = availableResources.find((e: any) => e[_idKey] === value);
    return item ? String((item as any)[_nameKey]) : '';
  };

  return (
    <FormControl
      fullWidth
      error={!!rawErrors.length}
      required={required}
      disabled={disabled}
    >
      <InputLabel id={`${name}-select-label`}>
        {title ?? 'Inventory'}&nbsp;
        {loading && <CircularProgress size={12} />}
      </InputLabel>
      <Select
        placeholder={title ?? 'Inventory'}
        multiple={multiple}
        labelId={`${name}-select-label`}
        label={title ?? 'Resource'}
        // @ts-ignore
        onChange={change}
        value={selected}
        renderValue={multiple ? renderSelectedValues : renderSingleValue}
      >
        {availableResources.length > 0 ? (
          availableResources.map((item, index) => {
            const credentialType = getCredentialType(item);
            return (
              // @ts-ignore
              <MenuItem key={index} value={item[_idKey]}>
                {credentialType ? (
                  <div className={classes.menuItemContent}>
                    <Typography>
                      <span style={{ fontWeight: 450 }}>
                        {/* @ts-ignore */}
                        {item[_nameKey]}
                      </span>{' '}
                      |{' '}
                      <span style={{ fontWeight: 400 }}>{credentialType}</span>
                    </Typography>
                  </div>
                ) : (
                  // @ts-ignore
                  item[_nameKey]
                )}
              </MenuItem>
            );
          })
        ) : (
          <MenuItem value={0} disabled>
            No{' '}
            {resource.includes('_')
              ? resource.replace(/[\s.,_]+/g, '-')
              : resource}{' '}
            found
          </MenuItem>
        )}
      </Select>
      {errors}
      <FormHelperText>{description}</FormHelperText>
      <FormHelperText>{help}</FormHelperText>
    </FormControl>
  );
};
