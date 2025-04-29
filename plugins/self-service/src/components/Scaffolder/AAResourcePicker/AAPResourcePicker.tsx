import React, { useCallback, useEffect, useState } from 'react';
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
    if (!formData) return [];
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
  const [selected, setSelected] = useState<
    string | number | string[] | number[]
    // @ts-ignore
  >(getInitValue);
  const [loading, setLoading] = useState<boolean>(false);
  const classes = useStyles();

  const updateAvailableResources = useCallback(() => {
    aapAuth.getAccessToken().then((token: string) => {
      if (scaffolderApi.autocomplete) {
        setLoading(true);
        scaffolderApi
          .autocomplete({
            token: token,
            resource: resource,
            provider: 'aap-api-cloud',
          })
          .then(({ results }) => {
            setAvailableResources(results);
            setLoading(false);
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
    let items;
    if (typeof values[0] === 'number') {
      items = availableResources.filter((e: any) => values.includes(e[_idKey]));
    } else {
      items = values;
    }
    return (
      <div className={classes.chips}>
        {/* @ts-ignore */}
        {items.map(value => (
          <Chip
            key={value[_idKey]}
            label={value[_nameKey]}
            className={classes.chip}
          />
        ))}
      </div>
    );
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
        {...(multiple && {
          renderValue: renderSelectedValues,
        })}
      >
        {availableResources.map((item, index) => (
          // @ts-ignore
          <MenuItem key={index} value={item[_idKey]}>
            {/* @ts-ignore */}
            {item[_nameKey]}
          </MenuItem>
        ))}
      </Select>
      {errors}
      <FormHelperText>{description}</FormHelperText>
      <FormHelperText>{help}</FormHelperText>
    </FormControl>
  );
};
