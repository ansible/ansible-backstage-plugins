import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
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

type AapResourcePickerSelection = string | number | string[] | number[];

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
  labelWithSpinner: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    maxWidth: '100%',
  },
  labelSpinner: {
    flexShrink: 0,
  },
  menuItemContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    width: '100%',
  },
}));

function primitiveFieldToString(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

function resourceIdsEqual(a: unknown, b: unknown): boolean {
  if (a === undefined || a === null || b === undefined || b === null) {
    return false;
  }
  return primitiveFieldToString(a) === primitiveFieldToString(b);
}

function getSelectionFromFieldValue(
  fd: unknown,
  multiple: boolean,
  _idKey: string,
): AapResourcePickerSelection {
  if (!fd) return multiple ? [] : '';
  if (typeof fd === 'string' || typeof fd === 'number') {
    return fd;
  }
  if (multiple && Array.isArray(fd)) {
    return fd.map((item: { [x: string]: any }) => item[_idKey]);
  }
  if (typeof fd === 'object' && !Array.isArray(fd)) {
    return (fd as Record<string, unknown>)[_idKey] as number;
  }
  return '';
}

function resourcesMatchingSelectedKeys(
  rows: Record<string, unknown>[],
  selectedArray: unknown[],
  lookupKey: string,
): Record<string, unknown>[] {
  return rows.filter(row => selectedArray.includes(row[lookupKey] as never));
}

function extractIdsFromRows(
  rows: Record<string, unknown>[],
  idKey: string,
): (string | number)[] {
  return rows.map(row => row[idKey]) as (string | number)[];
}

function applyInitialSelectionAfterAutocomplete(options: {
  results: unknown[];
  formData: unknown;
  multiple: boolean;
  idKey: string;
  nameKey: string;
  setSelected: Dispatch<SetStateAction<AapResourcePickerSelection>>;
}): void {
  const records = options.results as Record<string, unknown>[];
  const currentInit = getSelectionFromFieldValue(
    options.formData,
    options.multiple,
    options.idKey,
  );
  const lookupKey =
    typeof currentInit === 'string' ? options.nameKey : options.idKey;
  const selectedArray = Array.isArray(currentInit)
    ? currentInit
    : [currentInit];
  const matched = resourcesMatchingSelectedKeys(
    records,
    selectedArray,
    lookupKey,
  );
  const ids = extractIdsFromRows(matched, options.idKey);
  options.setSelected(
    options.multiple ? (ids as string[] | number[]) : (ids[0] ?? ''),
  );
}

function filterResourcesMatchingAnyIdValue(
  resources: Record<string, unknown>[],
  rawValues: unknown[],
  idKey: string,
): Record<string, unknown>[] {
  return resources.filter(item =>
    rawValues.some(v => resourceIdsEqual(v, item[idKey])),
  );
}

function filterResourcesMatchingNames(
  resources: Record<string, unknown>[],
  values: unknown[],
  nameKey: string,
): Record<string, unknown>[] {
  return resources.filter(e => values.includes(e[nameKey]));
}

function stableSelectionFingerprint(
  fd: unknown,
  multiple: boolean,
  _idKey: string,
): string {
  if (fd === undefined || fd === null || fd === '') return '';
  if (typeof fd === 'string' || typeof fd === 'number') {
    return String(fd);
  }
  if (multiple && Array.isArray(fd)) {
    return fd.map((item: any) => item[_idKey]).join(',');
  }
  if (typeof fd === 'object' && !Array.isArray(fd)) {
    return primitiveFieldToString((fd as Record<string, unknown>)[_idKey]);
  }
  return '';
}

function formatResourceKeyForEmptyMessage(resourceKey: string): string {
  if (!resourceKey.includes('_')) {
    return resourceKey;
  }
  return resourceKey.replaceAll(/[\s.,_]+/g, '-');
}

export const AAPResourcePicker = (props: ScaffolderRJSFFieldProps) => {
  const {
    name,
    rawErrors = [],
    errors,
    help,
    required,
    disabled,
    schema: schemaProp,
    uiSchema,
    formData,
    onChange,
  } = props;

  const schema = schemaProp as {
    description?: string;
    title?: string;
    resource?: string;
    type?: string;
    idKey?: string;
    nameKey?: string;
  };

  const { description, title, type, idKey, nameKey } = schema;

  const resource =
    schema.resource ??
    (
      uiSchema as
        | { 'ui:options'?: { autocomplete?: { resource?: string } } }
        | undefined
    )?.['ui:options']?.autocomplete?.resource ??
    '';
  const _idKey: string = idKey ?? 'id';
  const _nameKey: string = nameKey ?? 'name';
  const multiple = type === 'array';

  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  const stableFieldSelectionKey = useMemo(
    () => stableSelectionFingerprint(formData, multiple, _idKey),
    [formData, multiple, _idKey],
  );

  const aapAuth = useApi(rhAapAuthApiRef);
  const scaffolderApi = useApi(scaffolderApiRef);
  const [availableResources, setAvailableResources] = useState<
    Record<string, unknown>[]
  >([]);

  // Store the initial formData for rendering chips before API loads
  const [initialFormData, setInitialFormData] = useState<any>(formData);

  const [selected, setSelected] = useState<AapResourcePickerSelection>(
    // @ts-ignore
    () => getSelectionFromFieldValue(formData, multiple, _idKey),
  );
  const [loading, setLoading] = useState<boolean>(false);
  const classes = useStyles();

  useEffect(() => {
    setSelected(
      getSelectionFromFieldValue(formDataRef.current, multiple, _idKey),
    );
  }, [stableFieldSelectionKey, multiple, _idKey]);

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
    if (!resource) {
      setAvailableResources([]);
      setLoading(false);
      return;
    }
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
              applyInitialSelectionAfterAutocomplete({
                results,
                formData: formDataRef.current,
                multiple,
                idKey: _idKey,
                nameKey: _nameKey,
                setSelected,
              });
            }
            setAvailableResources(results as Record<string, unknown>[]);
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

  const resourceHasId = useCallback(
    (id: unknown) =>
      availableResources.some((r: Record<string, unknown>) =>
        resourceIdsEqual(r[_idKey], id),
      ),
    [availableResources, _idKey],
  );

  const muiSelectValue = useMemo(() => {
    if (multiple) {
      if (!Array.isArray(selected) || selected.length === 0) {
        return [] as string[] | number[];
      }
      if (loading || availableResources.length === 0) {
        return [] as string[] | number[];
      }
      const filtered = selected.filter(id => resourceHasId(id));
      return filtered.length === selected.length ? selected : filtered;
    }
    if (loading || availableResources.length === 0) {
      return '';
    }
    if (selected === '' || selected === undefined || selected === null) {
      return '';
    }
    return resourceHasId(selected) ? selected : '';
  }, [multiple, loading, availableResources.length, selected, resourceHasId]);

  /** True when formData still carries a visible label (while Select value may be '' until options load). */
  const hasFormDataDisplayLabel = useMemo(() => {
    const fd = formData;
    if (fd && typeof fd === 'object' && !Array.isArray(fd)) {
      return Boolean((fd as Record<string, unknown>)[_nameKey]);
    }
    return typeof fd === 'string' || typeof fd === 'number';
  }, [formData, _nameKey]);

  /**
   * OutlinedInput only auto-shrinks the label from `value`. We sometimes use value="" before
   * MenuItems exist while renderValue shows the selection from formData — force shrink so the
   * label does not sit on top of that text.
   */
  const inputLabelShrink = useMemo(() => {
    if (multiple) {
      return Array.isArray(muiSelectValue) && muiSelectValue.length > 0;
    }
    const hasControlValue =
      muiSelectValue !== '' &&
      muiSelectValue !== undefined &&
      muiSelectValue !== null;
    return hasControlValue || hasFormDataDisplayLabel;
  }, [multiple, muiSelectValue, hasFormDataDisplayLabel]);

  function change(event: any) {
    let {
      target: { value },
    } = event;
    let endValue: Object | Array<Object> | undefined;
    if (multiple) {
      value = value.map((e: any) => (e instanceof Object ? e[_idKey] : e));
      endValue = filterResourcesMatchingAnyIdValue(
        availableResources,
        value,
        _idKey,
      );
    } else {
      if (value === '' || value === undefined) {
        return;
      }
      endValue = availableResources.find((res: any) =>
        resourceIdsEqual(res[_idKey], value),
      );
      if (!endValue) {
        return;
      }
    }
    // @ts-ignore
    setSelected(multiple ? value : (endValue as any)[_idKey]);
    onChange(endValue);
  }

  const renderSelectedValues = (values: any) => {
    if (!Array.isArray(values) || values.length === 0) {
      return <span />;
    }
    let items: any[] = [];
    if (typeof values[0] === 'number') {
      items = filterResourcesMatchingAnyIdValue(
        availableResources,
        values,
        _idKey,
      );
    } else {
      items = filterResourcesMatchingNames(
        availableResources,
        values,
        _nameKey,
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
    const item = availableResources.find((e: any) =>
      resourceIdsEqual(e[_idKey], value),
    );
    return item ? String((item as any)[_nameKey]) : '';
  };

  const renderSingleDisplay = (muiValue: unknown) => {
    if (multiple) {
      return renderSelectedValues(muiValue);
    }
    if (muiValue !== '' && muiValue !== undefined) {
      return renderSingleValue(muiValue);
    }
    const fd = formDataRef.current;
    if (fd && typeof fd === 'object' && !Array.isArray(fd) && fd[_nameKey]) {
      return primitiveFieldToString((fd as Record<string, unknown>)[_nameKey]);
    }
    if (typeof fd === 'string' || typeof fd === 'number') {
      return String(fd);
    }
    return '';
  };

  return (
    <FormControl
      fullWidth
      error={!!rawErrors.length}
      required={required}
      disabled={disabled}
    >
      <InputLabel id={`${name}-select-label`} shrink={inputLabelShrink}>
        <span className={classes.labelWithSpinner}>
          {title ?? 'Inventory'}
          {loading && (
            <CircularProgress className={classes.labelSpinner} size={12} />
          )}
        </span>
      </InputLabel>
      <Select
        placeholder={title ?? 'Inventory'}
        multiple={multiple}
        displayEmpty
        labelId={`${name}-select-label`}
        label={title ?? 'Resource'}
        // @ts-ignore
        onChange={change}
        value={muiSelectValue}
        renderValue={renderSingleDisplay}
      >
        {availableResources.length > 0 ? (
          availableResources.map(item => {
            const credentialType = getCredentialType(item);
            return (
              <MenuItem
                key={String(item[_idKey])}
                value={item[_idKey] as string | number}
              >
                {credentialType ? (
                  <div className={classes.menuItemContent}>
                    <Typography>
                      <span style={{ fontWeight: 450 }}>
                        {primitiveFieldToString(item[_nameKey])}
                      </span>{' '}
                      |{' '}
                      <span style={{ fontWeight: 400 }}>{credentialType}</span>
                    </Typography>
                  </div>
                ) : (
                  primitiveFieldToString(item[_nameKey])
                )}
              </MenuItem>
            );
          })
        ) : (
          <MenuItem value="" disabled>
            {loading
              ? 'Loading…'
              : `No ${formatResourceKeyForEmptyMessage(resource)} found`}
          </MenuItem>
        )}
      </Select>
      {errors}
      <FormHelperText>{description}</FormHelperText>
      <FormHelperText>{help}</FormHelperText>
      {!resource && (
        <FormHelperText error>
          Missing AAP resource: set `resource` on the property schema, or
          `ui:options.autocomplete.resource` (e.g. organizations, inventories).
        </FormHelperText>
      )}
    </FormControl>
  );
};
