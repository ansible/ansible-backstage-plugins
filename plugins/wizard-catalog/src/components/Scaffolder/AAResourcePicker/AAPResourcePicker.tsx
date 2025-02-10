import React, { useCallback, useState } from 'react';
import useDebounce from 'react-use/esm/useDebounce';
import { useApi } from '@backstage/core-plugin-api';
import {
  scaffolderApiRef,
  ScaffolderRJSFFieldProps,
} from '@backstage/plugin-scaffolder-react';

import FormControl from '@material-ui/core/FormControl';
import FormHelperText from '@material-ui/core/FormHelperText';

import { InputLabel, MenuItem, Select } from '@material-ui/core';
import { SelectChangeEvent } from '@mui/material/Select';
import { rhAapAuthApiRef } from '../../../apis';

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
  const _idKey = idKey ?? 'id';
  const _nameKey = nameKey ?? 'name';
  const aapAuth = useApi(rhAapAuthApiRef);
  const scaffolderApi = useApi(scaffolderApiRef);
  const [availableResources, setAvailableResources] = useState<{}[]>([]);
  const multiple = type === 'array';
  let selected: string | number | string[] | number[] | null = null;
  if (formData) {
    selected = multiple
      ? // @ts-ignore
        formData.map((item: {}) => item[_idKey])
      : formData[_idKey];
  }

  const updateAvailableResources = useCallback(() => {
    aapAuth.getAccessToken().then((token: string) => {
      if (scaffolderApi.autocomplete) {
        scaffolderApi
          .autocomplete({
            token: token,
            resource: resource,
            provider: 'aap-api-cloud',
          })
          .then(({ results }) => {
            setAvailableResources(results);
          })
          .catch(() => {
            setAvailableResources([]);
          });
      } else {
        setAvailableResources([]);
      }
    });
  }, [aapAuth, resource, scaffolderApi]);
  useDebounce(updateAvailableResources, 500, [updateAvailableResources]);

  function change(event: SelectChangeEvent) {
    const {
      target: { value },
    } = event;
    let endValue: {} | {}[] | undefined;
    if (multiple) {
      endValue = availableResources.filter(item =>
        // @ts-ignore
        value.includes(item[_idKey]),
      );
    } else {
      // @ts-ignore
      endValue = availableResources.find(res => res[_idKey] === value);
    }
    onChange(endValue);
  }

  return (
    <FormControl
      fullWidth
      error={!!rawErrors.length}
      required={required}
      disabled={disabled}
    >
      <InputLabel id={`${name}-select-label`}>
        {title ?? 'Inventory'}
      </InputLabel>
      <Select
        native={false}
        placeholder={title ?? 'Inventory'}
        multiple={multiple}
        labelId={`${name}-select-label`}
        label={title ?? 'Resource'}
        // @ts-ignore
        onChange={change}
        value={selected}
      >
        {availableResources.map(item => (
          // @ts-ignore
          <MenuItem value={item[_idKey]}>{item[_nameKey]}</MenuItem>
        ))}
      </Select>
      {errors}
      <FormHelperText>{description}</FormHelperText>
      <FormHelperText>{help}</FormHelperText>
    </FormControl>
  );
};
