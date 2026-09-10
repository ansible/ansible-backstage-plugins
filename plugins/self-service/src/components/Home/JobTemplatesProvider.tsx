import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { ansibleApiRef } from '../../apis';

export type JobTemplateSummary = { id: number; name: string };

type JobTemplatesLoadState = 'loading' | 'ready' | 'error';

export type RefreshJobTemplatesOptions = {
  /** Keep the current list visible while re-fetching (e.g. after AAP sync). */
  background?: boolean;
};

type JobTemplatesContextValue = {
  jobTemplates: JobTemplateSummary[];
  loadState: JobTemplatesLoadState;
  errorMessage: string | null;
  refreshJobTemplates: (
    options?: RefreshJobTemplatesOptions,
  ) => Promise<JobTemplateSummary[] | undefined>;
};

const JobTemplatesContext = createContext<JobTemplatesContextValue | undefined>(
  undefined,
);

export const useJobTemplates = (): JobTemplatesContextValue => {
  const value = useContext(JobTemplatesContext);
  if (!value) {
    throw new Error('useJobTemplates must be used within JobTemplatesProvider');
  }
  return value;
};

export const JobTemplatesProvider = ({ children }: PropsWithChildren) => {
  const ansibleApi = useApi(ansibleApiRef);
  const [jobTemplates, setJobTemplates] = useState<JobTemplateSummary[]>([]);
  const [loadState, setLoadState] = useState<JobTemplatesLoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fetchRequestIdRef = useRef(0);

  const refreshJobTemplates = useCallback(
    async (
      options?: RefreshJobTemplatesOptions,
    ): Promise<JobTemplateSummary[] | undefined> => {
      const requestId = ++fetchRequestIdRef.current;
      const background = options?.background ?? false;

      if (!background) {
        setLoadState('loading');
        setErrorMessage(null);
      }

      try {
        const { items } = await ansibleApi.getUserJobTemplates();
        const nextTemplates = items.map(item => ({
          id: item.id,
          name: item.name,
        }));

        if (requestId === fetchRequestIdRef.current) {
          setJobTemplates(nextTemplates);
          setLoadState('ready');
          if (background) {
            setErrorMessage(null);
          }
        }
        return nextTemplates;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (requestId === fetchRequestIdRef.current) {
          if (background) {
            setErrorMessage(message);
          } else {
            setLoadState('error');
            setErrorMessage(message);
          }
        }
        return undefined;
      }
    },
    [ansibleApi],
  );

  useEffect(() => {
    void refreshJobTemplates();
  }, [refreshJobTemplates]);

  const value = useMemo(
    () => ({
      jobTemplates,
      loadState,
      errorMessage,
      refreshJobTemplates,
    }),
    [jobTemplates, loadState, errorMessage, refreshJobTemplates],
  );

  return (
    <JobTemplatesContext.Provider value={value}>
      {children}
    </JobTemplatesContext.Provider>
  );
};
