import {
  appTreeApiRef,
  configApiRef,
  useApi,
} from '@backstage/frontend-plugin-api';
import { Content, InfoCard } from '@backstage/core-components';
import Typography from '@material-ui/core/Typography';
import Box from '@material-ui/core/Box';
import { Navigate } from 'react-router-dom';
import { resolveLandingDestination } from './landingDestination';
import portalIcon from './assets/automation-portal.svg';

/** Root routing is host-owned; contributor pages retain their own access checks. */
export function PortalLandingPage() {
  const config = useApi(configApiRef);
  const appTree = useApi(appTreeApiRef);
  const destination = resolveLandingDestination(
    appTree,
    config.getOptionalString('portal.landingPage'),
  );

  if (destination) return <Navigate to={destination} replace />;

  return (
    <Content>
      <InfoCard
        title={
          <Box display="flex" alignItems="center" gridGap={16}>
            <img
              src={portalIcon}
              alt="Automation Portal"
              width={48}
              height={48}
            />
            <span>Welcome to Automation Portal</span>
          </Box>
        }
      >
        <Typography paragraph>
          No landing page is available. Choose an available destination from the
          sidebar, or contact your administrator if none are listed.
        </Typography>
      </InfoCard>
    </Content>
  );
}
