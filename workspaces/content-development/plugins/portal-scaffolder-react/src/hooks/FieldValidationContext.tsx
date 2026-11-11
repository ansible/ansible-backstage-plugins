import {
  createContext,
  useState,
  useCallback,
  useContext,
  useMemo,
} from 'react';
import type { ReactNode } from 'react';

type FieldValidationContextType = {
  setFieldError: (id: string, hasError: boolean) => void;
  hasErrors: boolean;
  submitAttempted: boolean;
  notifySubmitAttempted: () => void;
  resetSubmitAttempted: () => void;
};

const FieldValidationContext = createContext<FieldValidationContextType>({
  setFieldError: () => {},
  hasErrors: false,
  submitAttempted: false,
  notifySubmitAttempted: () => {},
  resetSubmitAttempted: () => {},
});

export const useFieldValidation = () => useContext(FieldValidationContext);

export const FieldValidationProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const setFieldError = useCallback((id: string, hasError: boolean) => {
    setFieldErrors(prev => {
      if (prev[id] === hasError) return prev;
      const next = { ...prev };
      if (hasError) {
        next[id] = true;
      } else {
        delete next[id];
      }
      return next;
    });
  }, []);

  const notifySubmitAttempted = useCallback(() => {
    setSubmitAttempted(true);
  }, []);

  const resetSubmitAttempted = useCallback(() => {
    setSubmitAttempted(false);
  }, []);

  const hasErrors = Object.values(fieldErrors).some(Boolean);

  const contextValue = useMemo(
    () => ({
      setFieldError,
      hasErrors,
      submitAttempted,
      notifySubmitAttempted,
      resetSubmitAttempted,
    }),
    [
      setFieldError,
      hasErrors,
      submitAttempted,
      notifySubmitAttempted,
      resetSubmitAttempted,
    ],
  );

  return (
    <FieldValidationContext.Provider value={contextValue}>
      {children}
    </FieldValidationContext.Provider>
  );
};
