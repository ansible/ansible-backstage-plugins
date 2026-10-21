import { Component, useEffect, useState, type PropsWithChildren } from 'react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import type { FieldExtensionOptions } from '@backstage/plugin-scaffolder-react';
import type { ScaffolderFieldDescriptor } from '@ansible/portal-extension-api/alpha';
import { DEFAULT_EXPERIENCES } from './PortalEntityTabs';

const EMPTY_NAMES: readonly string[] = [];

class FieldBoundary extends Component<
  PropsWithChildren<{ onError: () => void }>,
  { failed: boolean }
> {
  static getDerivedStateFromError() {
    return { failed: true };
  }
  state = { failed: false };
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? (
      <p role="alert">Template widget failed.</p>
    ) : (
      this.props.children
    );
  }
}

/** Wrap a loaded field component so widget exceptions report failure to the scaffolder shell. */
function guardField(
  field: FieldExtensionOptions<any, any>,
  onError: () => void,
): FieldExtensionOptions<any, any> {
  const Widget = field.component;
  /** Render the widget inside a boundary without altering its field props or validation contract. */
  function GuardedField(
    props: Readonly<Parameters<typeof Widget>[0]>,
  ) {
    return (
      <FieldBoundary onError={onError}>
        <Widget {...props} />
      </FieldBoundary>
    );
  }
  return { ...field, component: GuardedField };
}

/** Resolve widgets before mounting the wizard; failures never fall back to generic inputs. */
export function NativeScaffolderFields({
  declarations,
  reservedNames = EMPTY_NAMES,
  availableExperiences = DEFAULT_EXPERIENCES,
  children,
}: Readonly<{
  declarations: readonly ScaffolderFieldDescriptor[];
  reservedNames?: readonly string[];
  availableExperiences?: readonly string[];
  children: (fields: FieldExtensionOptions<any, any>[]) => JSX.Element;
}>) {
  const config = useApi(configApiRef);
  const permissions = useApi(permissionApiRef);
  const [state, setState] = useState<{
    declarations: typeof declarations;
    reservedNames: typeof reservedNames;
    availableExperiences: typeof availableExperiences;
    fields?: FieldExtensionOptions<any, any>[];
    error?: boolean;
    failedNames?: string[];
  }>();
  useEffect(() => {
    let cancelled = false;
    /** Mark the current field declaration set as failed when a widget boundary reports an error. */
    const handleFieldError = () => {
      if (cancelled) return;
      setState(previous =>
        previous?.declarations === declarations
          ? { ...previous, error: true }
          : previous,
      );
    };
    /** Resolve permitted field declarations and retain failure details instead of silently replacing widgets. */
    async function load() {
      try {
        const failedNames: string[] = [];
        const fields = await Promise.all(
          declarations.map(
            async (
              declaration,
            ): Promise<FieldExtensionOptions<any, any> | undefined> => {
              try {
                const capability = declaration.manifest.capabilities.find(
                  item => item.id === declaration.capabilityId,
                );
                const entry = capability?.entryPoints.find(
                  item => item.id === declaration.entryPointId,
                );
                if (
                  !capability ||
                  !entry ||
                  reservedNames.includes(declaration.fieldName) ||
                  !availableExperiences.includes(capability.experienceId) ||
                  (declaration.enabledByConfig &&
                    config.getOptionalBoolean(declaration.enabledByConfig) !==
                      true)
                )
                  return undefined;
                if (entry.requiredPermission) {
                  const requirement = entry.requiredPermission;
                  const decision = await permissions.authorize(
                    'permission' in requirement
                      ? requirement
                      : { permission: requirement },
                  );
                  if (decision.result !== AuthorizeResult.ALLOW)
                    return undefined;
                }
                const field = await declaration.loader();
                if (
                  field.name !== declaration.fieldName ||
                  typeof field.component !== 'function' ||
                  (field.validation && typeof field.validation !== 'function')
                )
                  throw new Error('Invalid loaded field');
                return guardField(field, handleFieldError);
              } catch {
                failedNames.push(declaration.fieldName);
                return undefined;
              }
            },
          ),
        );
        if (!cancelled)
          setState({
            declarations,
            reservedNames,
            availableExperiences,
            failedNames,
            fields: fields.filter(
              (field): field is FieldExtensionOptions<any, any> =>
                Boolean(field),
            ),
          });
      } catch {
        if (!cancelled)
          setState({
            declarations,
            reservedNames,
            availableExperiences,
            error: true,
          });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [declarations, reservedNames, availableExperiences, config, permissions]);
  if (
    state?.declarations !== declarations ||
    state.reservedNames !== reservedNames ||
    state.availableExperiences !== availableExperiences
  )
    return (
      <output style={{ display: 'block', margin: '1em 0' }}>
        Loading template fields…
      </output>
    );
  if (state.error)
    return (
      <p role="alert">
        Template fields could not be loaded. Reload before continuing.
      </p>
    );
  return state.fields ? (
    <>
      {!!state.failedNames?.length && (
        <p role="alert">
          Some template fields could not be loaded:{' '}
          {state.failedNames.join(', ')}. Templates requiring them are
          unavailable.
        </p>
      )}
      {children(state.fields)}
    </>
  ) : (
    <output style={{ display: 'block', margin: '1em 0' }}>
      Loading template fields…
    </output>
  );
}
