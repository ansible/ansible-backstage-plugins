import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { IChangeEvent } from '@rjsf/core';
import { getDefaultFormState } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import { EntityPickerFieldExtension } from '@backstage/plugin-scaffolder';
import {
  ScaffolderFieldExtensions,
  SecretsContextProvider,
  useTemplateSecrets,
} from '@backstage/plugin-scaffolder-react';
import { useApi } from '@backstage/core-plugin-api';

import {
  Button,
  Paper,
  Step,
  StepContent,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@material-ui/core';
import { rhAapAuthApiRef } from '../../apis';
import { formExtraFields } from './formExtraFields';
import {
  collectSensitiveTemplateKeysFromSteps,
  sanitizeFormDataForSessionStorage,
} from './sanitizeFormDataForSessionStorage';
import { ScaffolderForm } from './ScaffolderFormWrapper';

const MERGE_DEFAULTS_BEHAVIOR = {
  allOf: 'populateDefaults' as const,
  mergeDefaultsIntoFormData: 'useFormDataIfPresent' as const,
};

const INITIAL_DEFAULTS_BEHAVIOR = {
  allOf: 'skipDefaults' as const,
  mergeDefaultsIntoFormData: 'useFormDataIfPresent' as const,
};

function computeMergedDefaultsFromSteps(
  stepList: Array<{ schema?: Record<string, any> }>,
): Record<string, any> {
  const merged: Record<string, any> = {};
  for (const step of stepList) {
    if (!step.schema) {
      continue;
    }
    const partial = getDefaultFormState(
      validator,
      step.schema as any,
      undefined,
      undefined,
      false,
      INITIAL_DEFAULTS_BEHAVIOR,
    );
    if (partial && typeof partial === 'object' && !Array.isArray(partial)) {
      Object.assign(merged, partial);
    }
  }
  return merged;
}

interface StepFormProps {
  steps: Array<{
    title: string;
    schema: Record<string, any>;
  }>;
  submitFunction: (
    formData: Record<string, any>,
    secrets?: Record<string, string>,
  ) => Promise<void>;
  initialFormData?: Record<string, any>;
  storageKey?: string;
}

interface CreateButtonProps {
  onSubmit: (secrets?: Record<string, string>) => Promise<void>;
}

const CreateButton = ({ onSubmit }: CreateButtonProps) => {
  const { secrets } = useTemplateSecrets();
  const [submitting, setSubmitting] = useState(false);

  const handleClick = useCallback(async () => {
    setSubmitting(true);
    try {
      await onSubmit(secrets);
    } catch {
      // errors are logged by handleFinalSubmit before rethrow.
    } finally {
      setSubmitting(false);
    }
  }, [onSubmit, secrets]);

  return (
    <Button
      onClick={handleClick}
      disabled={submitting}
      variant="contained"
      color="secondary"
    >
      Create
    </Button>
  );
};

type StepSchemaPropertyMap = Record<string, any>;

function assignSchemaPropertyIfMissing(
  target: StepSchemaPropertyMap,
  key: string,
  value: unknown,
): void {
  if (!target[key]) {
    target[key] = value;
  }
}

function mergeRootSchemaProperties(
  target: StepSchemaPropertyMap,
  step: any,
): void {
  const props = step?.schema?.properties;
  if (props) {
    Object.assign(target, props);
  }
}

function mergeDependencyOneOfSchemaInto(
  target: StepSchemaPropertyMap,
  dependencies: StepSchemaPropertyMap,
): void {
  for (const depKey of Object.keys(dependencies)) {
    const branches = dependencies[depKey]?.oneOf;
    if (!Array.isArray(branches)) {
      continue;
    }
    for (const branch of branches) {
      const branchProps = branch?.properties;
      if (!branchProps) {
        continue;
      }
      for (const key of Object.keys(branchProps)) {
        if (key === depKey) {
          continue;
        }
        assignSchemaPropertyIfMissing(target, key, branchProps[key]);
      }
    }
  }
}

function mergeAllOfThenSchemaInto(
  target: StepSchemaPropertyMap,
  allOf: unknown,
): void {
  if (!Array.isArray(allOf)) {
    return;
  }
  for (const condition of allOf) {
    const thenProps = condition?.then?.properties;
    if (!thenProps) {
      continue;
    }
    for (const key of Object.keys(thenProps)) {
      assignSchemaPropertyIfMissing(target, key, thenProps[key]);
    }
  }
}

/** Union of top-level parameter keys a step schema may bind (incl. dependency oneOf / allOf). */
function getAllProperties(step: any): StepSchemaPropertyMap {
  const allProperties: StepSchemaPropertyMap = {};
  mergeRootSchemaProperties(allProperties, step);
  const dependencies = step?.schema?.dependencies;
  if (dependencies) {
    mergeDependencyOneOfSchemaInto(allProperties, dependencies);
  }
  const allOf = step?.schema?.allOf;
  if (allOf) {
    mergeAllOfThenSchemaInto(allProperties, allOf);
  }
  return allProperties;
}

function schemaPropertyUsesUiField(property: unknown): boolean {
  if (!property || typeof property !== 'object') {
    return false;
  }
  const p = property as Record<string, unknown>;
  const hasUiField =
    typeof p['ui:field'] === 'string' && p['ui:field'].length > 0;
  if (hasUiField) {
    return true;
  }
  const ui =
    p.ui && typeof p.ui === 'object' ? (p.ui as Record<string, unknown>) : null;
  if (ui === null) {
    return false;
  }
  return typeof ui.field === 'string' && ui.field.length > 0;
}

function stripUiFieldDefaultFromPropertyDef(
  prop: Record<string, any>,
): Record<string, any> {
  if (
    prop &&
    typeof prop === 'object' &&
    !Array.isArray(prop) &&
    schemaPropertyUsesUiField(prop) &&
    Object.hasOwn(prop, 'default')
  ) {
    const { default: _removed, ...rest } = prop;
    return rest;
  }
  return prop;
}

function stripUiFieldDefaultsInPropertyMap(
  properties: Record<string, any>,
): Record<string, any> {
  const out = { ...properties };
  for (const key of Object.keys(out)) {
    const prop = out[key];
    if (prop && typeof prop === 'object' && !Array.isArray(prop)) {
      out[key] = stripUiFieldDefaultFromPropertyDef(prop);
    }
  }
  return out;
}

export function stripSchemaDefaultsForUiFieldProps(
  schema: Record<string, any>,
): Record<string, any> {
  if (!schema?.properties || typeof schema.properties !== 'object') {
    return schema;
  }
  const next: Record<string, any> = { ...schema };
  next.properties = stripUiFieldDefaultsInPropertyMap({ ...schema.properties });

  const dependencies = schema.dependencies;
  if (
    dependencies &&
    typeof dependencies === 'object' &&
    !Array.isArray(dependencies)
  ) {
    const nextDeps: Record<string, any> = { ...dependencies };
    for (const depKey of Object.keys(nextDeps)) {
      const dep = nextDeps[depKey];
      if (!dep || typeof dep !== 'object' || Array.isArray(dep)) {
        continue;
      }
      const oneOf = dep.oneOf;
      if (!Array.isArray(oneOf)) {
        continue;
      }
      nextDeps[depKey] = {
        ...dep,
        oneOf: oneOf.map((branch: Record<string, any>) => {
          if (!branch?.properties || typeof branch.properties !== 'object') {
            return branch;
          }
          return {
            ...branch,
            properties: stripUiFieldDefaultsInPropertyMap({
              ...branch.properties,
            }),
          };
        }),
      };
    }
    next.dependencies = nextDeps;
  }

  const allOf = schema.allOf;
  if (Array.isArray(allOf)) {
    next.allOf = allOf.map((condition: Record<string, any>) => {
      const thenProps = condition?.then?.properties;
      if (!thenProps || typeof thenProps !== 'object') {
        return condition;
      }
      // prettier-ignore
      return {
        ...condition,
        then: { // NOSONAR — JSON Schema `if`/`then` keyword, not a Promise
          ...condition.then,
          properties: stripUiFieldDefaultsInPropertyMap({ ...thenProps }),
        },
      };
    });
  }

  return next;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function deepMergePlainObjects(
  base: Record<string, any>,
  patch: Record<string, any>,
): Record<string, any> {
  const out: Record<string, any> = { ...base };
  for (const key of Object.keys(patch)) {
    const b = base[key];
    const p = patch[key];
    if (isPlainObject(b) && isPlainObject(p)) {
      out[key] = deepMergePlainObjects(b, p);
    } else {
      out[key] = p;
    }
  }
  return out;
}

function mergeStepFormDataHybrid(
  prev: Record<string, any>,
  step: { schema?: Record<string, any> },
  patch: Record<string, any>,
): Record<string, any> {
  const stepPropsMap = getAllProperties(step);
  const stepKeys = Object.keys(stepPropsMap);
  const next: Record<string, any> = { ...prev };
  for (const key of Object.keys(patch)) {
    const prevVal = prev[key];
    const patchVal = patch[key];
    next[key] =
      isPlainObject(prevVal) && isPlainObject(patchVal)
        ? deepMergePlainObjects(prevVal, patchVal)
        : patchVal;
  }

  if (Object.keys(patch).length > 0) {
    for (const k of stepKeys) {
      if (!(k in patch) && !schemaPropertyUsesUiField(stepPropsMap[k])) {
        delete next[k];
      }
    }
  }

  return next;
}

export const StepForm = ({
  steps,
  submitFunction,
  initialFormData,
  storageKey,
}: StepFormProps) => {
  // Filter out steps that only contain a "token" field
  const filteredSteps = useMemo(() => {
    return steps.filter(step => {
      const properties = step.schema?.properties || {};
      const propertyKeys = Object.keys(properties);

      // Skip step if it only has "token" field or no fields at all
      if (propertyKeys.length === 0) return false;
      if (propertyKeys.length === 1 && propertyKeys[0] === 'token')
        return false;

      return true;
    });
  }, [steps]);

  const sessionStorageOmitKeys = useMemo(
    () => collectSensitiveTemplateKeysFromSteps(steps),
    [steps],
  );

  // storage keys for form persistence to handle oAuth window reload
  const formDataStorageKey = storageKey
    ? `scaffolder-form-data-${storageKey}`
    : null;
  const activeStepStorageKey = storageKey
    ? `scaffolder-active-step-${storageKey}`
    : null;
  // generic oAuth pending flag (set by ScmSelector before oAuth)
  const OAUTH_PENDING_KEY = 'scaffolder-oauth-pending';

  const isOAuthRestoreRef = useRef<boolean | null>(null);
  if (isOAuthRestoreRef.current === null) {
    try {
      isOAuthRestoreRef.current =
        sessionStorage.getItem(OAUTH_PENDING_KEY) === 'true';
      // clear the flag after reading
      if (isOAuthRestoreRef.current) {
        sessionStorage.removeItem(OAUTH_PENDING_KEY);
      }
    } catch {
      isOAuthRestoreRef.current = false;
    }
  }
  const isOAuthRestore = isOAuthRestoreRef.current;

  // restore active step from sessionStorage after oAuth window reload
  const getInitialActiveStep = useCallback((): number => {
    if (isOAuthRestore && activeStepStorageKey) {
      try {
        const saved = sessionStorage.getItem(activeStepStorageKey);
        if (saved) {
          const step = Number.parseInt(saved, 10);
          if (!Number.isNaN(step) && step >= 0) {
            return step;
          }
        }
      } catch {
        // silently ignore parsing errors
      }
    }
    return filteredSteps.length === 0 ? filteredSteps.length : 0;
  }, [activeStepStorageKey, filteredSteps.length, isOAuthRestore]);

  const [activeStep, setActiveStep] = useState(getInitialActiveStep);
  const [formData, setFormData] = useState<Record<string, any>>(() => {
    const schemaDefaults = computeMergedDefaultsFromSteps(filteredSteps);
    if (isOAuthRestore && formDataStorageKey) {
      try {
        const saved = sessionStorage.getItem(formDataStorageKey);
        if (saved) {
          return { ...schemaDefaults, ...JSON.parse(saved) };
        }
      } catch {
        // silently ignore parsing errors
      }
    }
    if (initialFormData) {
      return { ...schemaDefaults, ...initialFormData };
    }
    return { ...schemaDefaults };
  });
  const [isAutoExecuting, setIsAutoExecuting] = useState(false);

  // always persist form data to sessionStorage for oAuth reload. write on every change,
  // including when the form is cleared, so we do not leave a stale non-empty snapshot.
  // blob: URLs are omitted (invalid after reload); oversized data: URLs may be omitted for quota
  useEffect(() => {
    if (!formDataStorageKey) {
      return;
    }
    try {
      const snapshot = sanitizeFormDataForSessionStorage(formData, {
        omitKeys: sessionStorageOmitKeys,
      });
      sessionStorage.setItem(formDataStorageKey, JSON.stringify(snapshot));
    } catch {
      // silently ignore storage errors
    }
  }, [formData, formDataStorageKey, sessionStorageOmitKeys]);

  // persist active step to sessionStorage
  useEffect(() => {
    if (activeStepStorageKey) {
      try {
        sessionStorage.setItem(activeStepStorageKey, String(activeStep));
      } catch {
        // silently ignore storage errors
      }
    }
  }, [activeStep, activeStepStorageKey]);

  // clear sessionStorage on unmount
  // incase user navigates to another page
  useEffect(() => {
    return () => {
      // only clear if OAuth is NOT pending
      // incase user navigates to another page
      try {
        const oauthPending =
          sessionStorage.getItem(OAUTH_PENDING_KEY) === 'true';
        if (!oauthPending) {
          if (formDataStorageKey) {
            sessionStorage.removeItem(formDataStorageKey);
          }
          if (activeStepStorageKey) {
            sessionStorage.removeItem(activeStepStorageKey);
          }
        }
      } catch {
        // silently ignore storage errors
      }
    };
  }, [formDataStorageKey, activeStepStorageKey]);

  useEffect(() => {
    if (initialFormData) {
      setFormData(prev => ({ ...initialFormData, ...prev }));
    }
  }, [initialFormData]);

  const hasDisplayableFields = useMemo(() => {
    return steps.some(step =>
      Object.entries(step.schema?.properties || {}).some(
        ([key, property]: [string, any]) => {
          if (key === 'token') return false;
          // Check if field has a default value or user input
          const hasDefault = property?.default !== undefined;
          const hasUserValue = formData[key] !== undefined;
          return hasDefault || hasUserValue;
        },
      ),
    );
  }, [steps, formData]);

  const aapAuth = useApi(rhAapAuthApiRef);

  const extensions = useMemo(() => {
    return Object.fromEntries(
      formExtraFields.map(({ name, component }) => [name, component]),
    );
  }, []);
  const fields = useMemo(() => ({ ...extensions }), [extensions]);

  const handleNext = useCallback(() => {
    setActiveStep(prevActiveStep => prevActiveStep + 1);
  }, []);

  const handleBack = () => {
    setActiveStep(prevActiveStep => prevActiveStep - 1);
  };

  // Hybrid merge: shallow-apply RJSF payloads, then remove step keys missing from the patch so
  // dependency/oneOf branches do not leave stale fields — except keys backed by `ui:field`, which
  // RJSF may omit from change events and must be retained (see mergeStepFormDataHybrid).
  const handleFormChange = useCallback(
    (stepIndex: number, data: IChangeEvent<any>) => {
      if (!data.formData) {
        return;
      }
      const step = filteredSteps[stepIndex];
      if (!step) {
        return;
      }
      setFormData(prev =>
        mergeStepFormDataHybrid(
          prev,
          step,
          data.formData as Record<string, any>,
        ),
      );
    },
    [filteredSteps],
  );

  const handleFormSubmit = useCallback(
    (stepIndex: number, data: IChangeEvent<any>) => {
      if (data.formData) {
        const step = filteredSteps[stepIndex];
        if (step) {
          setFormData(prev =>
            mergeStepFormDataHybrid(
              prev,
              step,
              data.formData as Record<string, any>,
            ),
          );
        }
      }
      handleNext();
    },
    [filteredSteps, handleNext],
  );

  // clear persisted form data from sessionStorage
  const clearPersistedFormData = useCallback(() => {
    if (formDataStorageKey) {
      try {
        sessionStorage.removeItem(formDataStorageKey);
      } catch {
        // silently ignore storage errors
      }
    }
    if (activeStepStorageKey) {
      try {
        sessionStorage.removeItem(activeStepStorageKey);
      } catch {
        // silently ignore storage errors
      }
    }
  }, [formDataStorageKey, activeStepStorageKey]);

  const handleFinalSubmit = useCallback(
    async (secretsArg?: Record<string, string>) => {
      try {
        const authToken = await aapAuth.getAccessToken();
        // Keep the AAP OAuth token only in scaffolder secrets (not in `values`) so it is not
        // duplicated in persisted task parameters / template context.
        const valuesForScaffold = { ...formData };
        delete valuesForScaffold.token;
        await submitFunction(valuesForScaffold, {
          ...secretsArg,
          aapToken: authToken,
        });
        clearPersistedFormData();
      } catch (error) {
        console.error('Error during final submission:', error); // eslint-disable-line no-console
        throw error;
      }
    },
    [formData, submitFunction, aapAuth, clearPersistedFormData],
  );

  // Auto-execute if no form steps and no displayable fields
  useEffect(() => {
    if (
      filteredSteps.length === 0 &&
      !hasDisplayableFields &&
      !isAutoExecuting
    ) {
      setIsAutoExecuting(true);
      // Use existing handleFinalSubmit function
      handleFinalSubmit().catch(error => {
        console.error('Error during auto-execution:', error); // eslint-disable-line no-console
        setIsAutoExecuting(false);
      });
    }
  }, [
    filteredSteps.length,
    hasDisplayableFields,
    isAutoExecuting,
    handleFinalSubmit,
  ]);

  const getLabel = (key: string, stepIndex: number) => {
    const allProperties = getAllProperties(steps[stepIndex]);
    return allProperties[key]?.title || key;
  };

  // Don't return early if no filtered steps - we still want to show the review step

  const extractUiFromProperty = (property: any): Record<string, any> | null => {
    if (!property) return null;

    const ui: Record<string, any> = {};
    let hasUiProperties = false;

    for (const key of Object.keys(property)) {
      if (key.startsWith('ui:')) {
        ui[key] = property[key];
        hasUiProperties = true;
      }
    }

    if (property.ui && typeof property.ui === 'object') {
      for (const uiKey of Object.keys(property.ui)) {
        const uiPropertyKey = `ui:${uiKey}`;
        if (!ui[uiPropertyKey]) {
          ui[uiPropertyKey] = property.ui[uiKey];
          hasUiProperties = true;
        }
      }
    }
    return hasUiProperties ? ui : null;
  };

  const extractUiSchema = (
    properties: Record<string, any>,
    dependencies?: Record<string, any>,
    allOf?: any[],
  ): Record<string, any> => {
    const uiSchema: Record<string, any> = {};

    if (!properties) return uiSchema;

    for (const key of Object.keys(properties)) {
      const property = properties[key];
      const ui = extractUiFromProperty(property);
      if (ui) {
        uiSchema[key] = ui;
      }

      if (property?.type === 'object' && property?.properties) {
        const nestedUi = extractUiSchema(
          property.properties,
          property.dependencies,
          property.allOf,
        );
        if (Object.keys(nestedUi).length > 0) {
          uiSchema[key] = { ...uiSchema[key], ...nestedUi };
        }
      }
    }

    if (dependencies) {
      for (const depKey of Object.keys(dependencies)) {
        const dependency = dependencies[depKey];
        if (dependency.oneOf && Array.isArray(dependency.oneOf)) {
          for (const branch of dependency.oneOf) {
            if (branch.properties) {
              for (const key of Object.keys(branch.properties)) {
                if (key !== depKey) {
                  const ui = extractUiFromProperty(branch.properties[key]);
                  if (ui) {
                    uiSchema[key] = ui;
                  }
                }
              }
            }
          }
        }
      }
    }

    if (allOf && Array.isArray(allOf)) {
      for (const condition of allOf) {
        if (condition.then?.properties) {
          for (const key of Object.keys(condition.then.properties)) {
            const ui = extractUiFromProperty(condition.then.properties[key]);
            if (ui) {
              uiSchema[key] = ui;
            }
          }
        }
      }
    }

    return uiSchema;
  };

  const extractProperties = (step: any) => {
    if (!step?.schema) {
      return {};
    }

    const schema = step.schema;
    const properties = schema.properties || {};
    const dependencies = schema.dependencies;
    const allOf = schema.allOf;

    const uiSchema = extractUiSchema(properties, dependencies, allOf);

    for (const key of Object.keys(schema)) {
      if (key.startsWith('ui:')) {
        uiSchema[key] = schema[key];
      }
    }

    return uiSchema;
  };

  const decodeBase64FileContent = (dataUrl: string): string | null => {
    if (
      typeof dataUrl === 'string' &&
      dataUrl.startsWith('data:text/plain;base64,')
    ) {
      try {
        const base64Content = dataUrl.split(',')[1];
        if (base64Content) {
          return atob(base64Content);
        }
      } catch {
        // If decoding fails, return null to fall back to default display
      }
    }
    return null;
  };

  const formatValueForDisplay = (val: any): string | JSX.Element => {
    if (val === undefined || val === null || val === '') {
      return '';
    }

    if (typeof val === 'string' && val.startsWith('data:text/plain;base64,')) {
      const decodedContent = decodeBase64FileContent(val);
      if (decodedContent) {
        return (
          <pre
            style={{
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
              padding: '8px',
              backgroundColor: 'rgba(128, 128, 128, 0.1)',
              border: '1px solid rgba(128, 128, 128, 0.4)',
              borderRadius: '4px',
              maxHeight: '200px',
              overflow: 'auto',
            }}
          >
            {decodedContent}
          </pre>
        );
      }
    }

    if (Array.isArray(val)) {
      if (val.length === 0) return '';
      if (typeof val[0] === 'string') {
        return val.join(', ');
      }
      if (typeof val[0] === 'object' && val[0]?.name) {
        return val.map(el => el.name).join(', ');
      }
      return val
        .map(el =>
          typeof el === 'object' && el !== null
            ? el.name || JSON.stringify(el)
            : String(el),
        )
        .join(', ');
    }

    if (typeof val === 'boolean') {
      return val ? 'Yes' : 'No';
    }

    if (typeof val === 'object' && val.name) {
      return val.name;
    }

    return String(val);
  };

  const renderNestedObject = (obj: Record<string, any>): JSX.Element => {
    const entries = Object.entries(obj).filter(([_, v]) => {
      if (v === undefined || v === null || v === '') return false;
      if (Array.isArray(v) && v.length === 0) return false;
      if (typeof v === 'boolean' && !v) return false;
      return true;
    });

    if (entries.length === 0) {
      return (
        <span
          style={{ color: 'rgba(128, 128, 128, 0.8)', fontStyle: 'italic' }}
        >
          None configured
        </span>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {entries.map(([k, v]) => {
          const label = k
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
          const formattedValue =
            typeof v === 'object' &&
            v !== null &&
            !Array.isArray(v) &&
            !(v as { name?: unknown }).name
              ? renderNestedObject(v as Record<string, unknown>)
              : formatValueForDisplay(v);

          return (
            <div key={k}>
              <strong style={{ fontSize: '0.85rem' }}>{label}:</strong>{' '}
              <span style={{ fontSize: '0.85rem' }}>{formattedValue}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const getReviewValue = (
    key: any,
    stepIndex?: number,
  ): string | JSX.Element => {
    const value = formData[key];

    if (
      typeof value === 'string' &&
      value.startsWith('data:text/plain;base64,')
    ) {
      return formatValueForDisplay(value);
    }

    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return formatValueForDisplay(value);
      }
      if (!value.name && Object.keys(value).length > 0) {
        return renderNestedObject(value);
      }

      return value.name ?? JSON.stringify(value);
    }
    if (stepIndex !== undefined) {
      const stepSchema = steps[stepIndex].schema.properties || {};
      if (stepSchema[key]?.type === 'boolean') {
        return value ? 'Yes' : 'No';
      }
    }
    return String(value || '');
  };

  return (
    <div>
      <SecretsContextProvider>
        <Stepper activeStep={activeStep} orientation="vertical">
          {filteredSteps.map((step, index) => (
            <Step key={index} completed={activeStep > index}>
              <StepLabel>{step.title}</StepLabel>
              <StepContent>
                {activeStep === index ? (
                  <ScaffolderForm
                    schema={{
                      ...stripSchemaDefaultsForUiFieldProps(
                        filteredSteps[index].schema,
                      ),
                      title: '',
                    }}
                    uiSchema={extractProperties(step)}
                    formData={formData}
                    fields={fields}
                    onChange={(data: IChangeEvent<any>) =>
                      handleFormChange(index, data)
                    }
                    onSubmit={(data: IChangeEvent<any>) =>
                      handleFormSubmit(index, data)
                    }
                    validator={validator}
                    experimental_defaultFormStateBehavior={
                      MERGE_DEFAULTS_BEHAVIOR
                    }
                  >
                    <ScaffolderFieldExtensions>
                      <EntityPickerFieldExtension />
                    </ScaffolderFieldExtensions>
                    <div style={{ marginTop: '25px' }}>
                      {index > 0 && (
                        <Button
                          onClick={handleBack}
                          style={{ marginRight: '10px' }}
                          variant="outlined"
                        >
                          Back
                        </Button>
                      )}
                      <Button type="submit" variant="contained" color="primary">
                        Next
                      </Button>
                    </div>
                  </ScaffolderForm>
                ) : null}
              </StepContent>
            </Step>
          ))}
          {/* Review Step */}
          <Step>
            <StepLabel>Review</StepLabel>
            <StepContent>
              <p>Please review if all information below is correct.</p>
              <TableContainer
                component={Paper}
                style={{ marginBottom: '10px' }}
              >
                <Table style={{ border: 0 }}>
                  <TableBody style={{ border: 0 }}>
                    {steps.flatMap((step, stepIndex) => {
                      const allProperties = getAllProperties(step);
                      const propertyRows = Object.entries(
                        allProperties,
                      ).flatMap(([key, _]) => {
                        if (key === 'token') {
                          return [];
                        }
                        const value = formData[key];
                        if (
                          value === undefined ||
                          value === null ||
                          value === ''
                        ) {
                          return [];
                        }
                        if (Array.isArray(value) && value.length === 0) {
                          return [];
                        }
                        const label = getLabel(key, stepIndex);
                        return (
                          <TableRow key={`${stepIndex}-${key}`}>
                            <TableCell style={{ border: 0 }}>{label}</TableCell>
                            <TableCell style={{ border: 0 }}>
                              {getReviewValue(key, stepIndex)}
                            </TableCell>
                          </TableRow>
                        );
                      });

                      const hasNoValues = propertyRows.length === 0;

                      return [
                        <TableRow key={`${stepIndex}-title`}>
                          <TableCell style={{ border: 0 }}>
                            <strong>{step.title}</strong>
                          </TableCell>
                          <TableCell
                            style={{
                              border: 0,
                              color: hasNoValues
                                ? 'rgba(128, 128, 128, 0.8)'
                                : 'inherit',
                              fontStyle: hasNoValues ? 'italic' : 'normal',
                            }}
                          >
                            {hasNoValues ? 'None' : ''}
                          </TableCell>
                        </TableRow>,
                        ...propertyRows,
                      ];
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <div style={{ marginTop: '25px' }}>
                {filteredSteps.length > 0 && (
                  <Button
                    onClick={handleBack}
                    style={{ marginRight: '10px' }}
                    variant="outlined"
                  >
                    Back
                  </Button>
                )}
                <CreateButton onSubmit={handleFinalSubmit} />
              </div>
            </StepContent>
          </Step>
        </Stepper>
        {activeStep === filteredSteps.length + 1 && (
          <Typography variant="h6" style={{ marginTop: '20px' }}>
            All steps completed!
          </Typography>
        )}
      </SecretsContextProvider>
    </div>
  );
};
