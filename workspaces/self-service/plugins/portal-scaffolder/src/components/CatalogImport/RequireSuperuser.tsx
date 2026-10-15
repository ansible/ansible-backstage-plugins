import type { ReactNode } from 'react';
import { CircularProgress } from '@material-ui/core';
import { Navigate } from 'react-router-dom';
import { useIsSuperuser } from '../../hooks';

/** Keep catalog import's AAP administrator guard identical across app systems. */
export function RequireSuperuser({ children }: { children: ReactNode }) {
  const { isSuperuser, loading, error } = useIsSuperuser();
  if (loading) {
    return (
      <div
        data-testid="superuser-loading"
        style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}
      >
        <CircularProgress />
      </div>
    );
  }
  if (error || !isSuperuser) {
    return <Navigate to="/self-service/catalog" replace />;
  }
  return <>{children}</>;
}
