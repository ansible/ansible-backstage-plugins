import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { InfoCard, Breadcrumbs, Progress } from '@backstage/core-components';
import {
  Grid,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stepper,
  Step,
  StepLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Box,
  Card,
  CardContent,
  Chip,
  makeStyles,
} from '@material-ui/core';
import SecurityIcon from '@material-ui/icons/Security';
import WarningIcon from '@material-ui/icons/Warning';
import { useApi } from '@backstage/core-plugin-api';
import { usePermission } from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';
import { complianceApiRef } from '../../api';
import { STATUS_COLORS } from '../shared/colors';

const useStyles = makeStyles(theme => ({
  stepContent: {
    minHeight: 300,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(3),
    padding: theme.spacing(3, 0),
  },
  selectedProfile: {
    border: `2px solid ${theme.palette.primary.main}`,
    backgroundColor: theme.palette.action.selected,
  },
  profileOption: {
    cursor: 'pointer',
    transition: 'all 0.2s',
    '&:hover': {
      borderColor: theme.palette.primary.light,
    },
  },
  reviewItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: theme.spacing(1.5, 0),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  launchButton: {
    marginTop: theme.spacing(2),
    padding: theme.spacing(1.5, 4),
  },
}));

import type {
  ComplianceProfile,
  PlatformValidationResult,
} from '@ansible/backstage-compliance-common/types';
import { CertificationBadge } from '../shared/CertificationBadge';

interface ProfileOption {
  id: string;
  name: string;
  version: string;
  rules: number;
  workflowTemplateId?: number | null;
}

interface InventoryOption {
  id: number;
  name: string;
  hostCount: number;
}

const steps = ['Select Profile', 'Select Targets', 'Review & Launch'];

export const ScanLauncher = () => {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useApi(complianceApiRef);

  // Permission check: reuse catalogEntityCreatePermission following
  // the upstream Ansible Portal pattern (Home.tsx, TemplateActions.tsx).
  // When RBAC is not configured, this defaults to allowed.
  const { allowed: canLaunchScan } = usePermission({
    permission: catalogEntityCreatePermission,
  });

  const [searchParams] = useSearchParams();
  const preselectedProfile = searchParams.get('profile') ?? '';
  const preselectedInventory = searchParams.get('inventory') ?? '';
  const scanTypeParam = searchParams.get('scanType') as
    | 'assessment'
    | 'verification'
    | null;
  const initialStep = (() => {
    if (preselectedProfile && preselectedInventory) return 2;
    if (preselectedProfile) return 1;
    return 0;
  })();
  const [activeStep, setActiveStep] = useState(initialStep);
  const [selectedProfile, setSelectedProfile] = useState(preselectedProfile);
  const [selectedInventory, setSelectedInventory] =
    useState(preselectedInventory);
  const [limit, setLimit] = useState('');
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [platformWarning, setPlatformWarning] =
    useState<PlatformValidationResult | null>(null);

  // Backend-fetched data — start empty, no hardcoded fallback
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [inventories, setInventories] = useState<InventoryOption[]>([]);
  const [registeredProfiles, setRegisteredProfiles] = useState<
    ComplianceProfile[]
  >([]);
  const [_dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getRegisteredProfiles().catch(err => {
        // eslint-disable-next-line no-console
        console.error('Failed to load registered profiles:', err);
        return [] as ComplianceProfile[];
      }),
      api.getProfiles().catch(err => {
        // eslint-disable-next-line no-console
        console.error('Failed to load display profiles:', err);
        return [];
      }),
      api.getInventories().catch(err => {
        // eslint-disable-next-line no-console
        console.error('Failed to load inventories:', err);
        return [] as Array<{ id: number; name: string; hostCount: number }>;
      }),
    ]).then(([registeredData, displayData, inventoryData]) => {
      setRegisteredProfiles(registeredData);
      if (registeredData.length > 0) {
        setProfiles(
          registeredData.map(c => ({
            id: c.id,
            name: c.displayName,
            version: c.version || '',
            rules: c.ruleCount ?? 0,
            workflowTemplateId: c.workflowTemplateId,
          })),
        );
      } else if (displayData.length > 0) {
        setProfiles(
          displayData.map(p => ({
            id: p.id,
            name: p.displayName,
            version: p.version,
            rules: p.ruleCount ?? 0,
            workflowTemplateId: p.workflowTemplateId,
          })),
        );
      }
      setInventories(inventoryData);
      setDataLoaded(true);
    });
  }, [api]);

  const profile = profiles.find(p => p.id === selectedProfile);
  const inventory = inventories.find(
    i => i.id.toString() === selectedInventory,
  );

  const [needsFactGather, setNeedsFactGather] = useState(false);

  const doLaunch = async (gatherFacts?: boolean) => {
    setLaunchError(null);
    try {
      const matchedProfile = profiles.find(c => c.id === selectedProfile);
      const scanRequest: Parameters<typeof api.launchScan>[0] = {
        profileId: selectedProfile,
        inventoryId: inventory?.id ?? 0,
        scanType: scanTypeParam || 'assessment',
        limit: limit || undefined,
        workflowTemplateId: matchedProfile?.workflowTemplateId ?? undefined,
        gatherFacts: gatherFacts || needsFactGather,
      };
      const result = await api.launchScan(scanRequest);
      navigate(`/compliance/results/${result.workflowJobId}`);
    } catch (err) {
      setLaunchError(
        err instanceof Error ? err.message : 'Failed to launch scan',
      );
    } finally {
      setLaunching(false);
    }
  };

  const handleLaunch = async () => {
    if (launching) return;
    setLaunching(true);
    setLaunchError(null);
    let gatherFacts = false;
    try {
      const validation = await api.validateScan({
        profileId: selectedProfile,
        inventoryId: inventory?.id ?? 0,
      });
      if (!validation.factsAvailable) {
        gatherFacts = true;
        setNeedsFactGather(true);
      }
      if (!validation.valid && validation.mismatchedHosts.length > 0) {
        setPlatformWarning(validation);
        setLaunching(false);
        return;
      }
    } catch {
      // Validation endpoint unavailable — proceed without blocking
    }
    await doLaunch(gatherFacts);
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <div className={classes.stepContent}>
            <Typography variant="h6">
              Choose a compliance profile to scan against
            </Typography>
            <Grid container spacing={2}>
              {profiles.map(p => (
                <Grid item xs={12} sm={4} key={p.id}>
                  <Card
                    variant="outlined"
                    className={`${classes.profileOption} ${
                      selectedProfile === p.id ? classes.selectedProfile : ''
                    }`}
                    onClick={() => setSelectedProfile(p.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedProfile(p.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select compliance profile ${p.name}`}
                    aria-pressed={selectedProfile === p.id}
                  >
                    <CardContent>
                      <Box
                        display="flex"
                        alignItems="center"
                        style={{ gap: 8 }}
                        mb={1}
                      >
                        <SecurityIcon color="primary" />
                        <Chip
                          label={p.version}
                          size="small"
                          variant="outlined"
                        />
                        {registeredProfiles.find(c => c.id === p.id)
                          ?.certification && (
                          <CertificationBadge
                            certification={
                              registeredProfiles.find(c => c.id === p.id)!
                                .certification
                            }
                          />
                        )}
                      </Box>
                      <Typography variant="subtitle1">{p.name}</Typography>
                      <Typography variant="body2" color="textSecondary">
                        {p.rules} rules
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </div>
        );

      case 1:
        return (
          <div className={classes.stepContent}>
            <Typography variant="h6">Select target hosts to scan</Typography>
            <FormControl variant="outlined" fullWidth>
              <InputLabel>Inventory</InputLabel>
              <Select
                value={selectedInventory}
                onChange={e => setSelectedInventory(e.target.value as string)}
                label="Inventory"
              >
                {inventories.map(inv => (
                  <MenuItem key={inv.id} value={inv.id.toString()}>
                    {inv.name} ({inv.hostCount} hosts)
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Limit (optional)"
              placeholder="host1,host2 or group_name"
              variant="outlined"
              fullWidth
              value={limit}
              onChange={e => setLimit(e.target.value)}
              helperText="Restrict scan to specific hosts or groups within the inventory"
            />
          </div>
        );

      case 2:
        return (
          <div className={classes.stepContent}>
            <Typography variant="h6">Review scan configuration</Typography>

            <InfoCard title="Scan Summary">
              <div className={classes.reviewItem}>
                <Typography variant="body2" color="textSecondary">
                  Profile
                </Typography>
                <Typography variant="body1">{profile?.name}</Typography>
              </div>
              <div className={classes.reviewItem}>
                <Typography variant="body2" color="textSecondary">
                  Version
                </Typography>
                <Typography variant="body1">{profile?.version}</Typography>
              </div>
              <div className={classes.reviewItem}>
                <Typography variant="body2" color="textSecondary">
                  Rules
                </Typography>
                <Typography variant="body1">{profile?.rules} rules</Typography>
              </div>
              <div className={classes.reviewItem}>
                <Typography variant="body2" color="textSecondary">
                  Target Inventory
                </Typography>
                <Typography variant="body1">
                  {inventory?.name} ({inventory?.hostCount} hosts)
                </Typography>
              </div>
            </InfoCard>

            {launchError && (
              <Box
                mt={2}
                p={2}
                bgcolor="#FAEAE5"
                borderRadius={4}
                border={`1px solid ${STATUS_COLORS.error}`}
              >
                <Typography
                  variant="body2"
                  style={{ color: STATUS_COLORS.error }}
                >
                  Scan launch failed: {launchError}
                </Typography>
              </Box>
            )}

            {launching ? (
              <Box mt={2}>
                <Progress />
                <Typography
                  variant="body2"
                  align="center"
                  style={{ marginTop: 8 }}
                >
                  Launching compliance scan...
                </Typography>
              </Box>
            ) : (
              <Button
                variant="contained"
                color="primary"
                size="large"
                className={classes.launchButton}
                onClick={handleLaunch}
                disabled={!profile || !inventory || !canLaunchScan}
                title={
                  !canLaunchScan
                    ? 'You do not have permission to launch scans'
                    : undefined
                }
              >
                {launchError ? 'Retry Scan' : 'Launch Scan'}
              </Button>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (activeStep) {
      case 0:
        return !!selectedProfile;
      case 1:
        return !!selectedInventory;
      case 2:
        return true;
      default:
        return false;
    }
  };

  return (
    <>
      <Breadcrumbs>
        <Typography
          color="primary"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate('/compliance')}
        >
          Compliance
        </Typography>
        <Typography>
          {scanTypeParam === 'verification' ? 'Verification Scan' : 'New Scan'}
        </Typography>
      </Breadcrumbs>

      <Box mt={3} />

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Stepper activeStep={activeStep} alternativeLabel>
            {steps.map(label => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Grid>

        <Grid item xs={12}>
          {renderStepContent(activeStep)}
        </Grid>

        <Grid item xs={12}>
          <Box display="flex" justifyContent="space-between">
            <Button
              disabled={activeStep === 0}
              onClick={() => setActiveStep(prev => prev - 1)}
            >
              Back
            </Button>
            {activeStep < steps.length - 1 && (
              <Button
                variant="contained"
                color="primary"
                disabled={!canProceed()}
                onClick={() => setActiveStep(prev => prev + 1)}
              >
                Next
              </Button>
            )}
          </Box>
        </Grid>
      </Grid>

      <Dialog
        open={!!platformWarning}
        onClose={() => setPlatformWarning(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" style={{ gap: 8 }}>
            <WarningIcon style={{ color: STATUS_COLORS.warning }} />
            Platform Compatibility Warning
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" paragraph>
            {platformWarning?.mismatchedHosts.length} of{' '}
            {(platformWarning?.matchedHosts.length ?? 0) +
              (platformWarning?.mismatchedHosts.length ?? 0)}{' '}
            hosts don't match the profile's platform requirements:
          </Typography>
          <Box
            component="ul"
            style={{
              maxHeight: 200,
              overflow: 'auto',
              paddingLeft: 20,
              margin: 0,
            }}
          >
            {platformWarning?.mismatchedHosts.map(h => (
              <li key={h.hostname}>
                <Typography variant="body2">
                  <strong>{h.hostname}</strong>: {h.reason}
                </Typography>
              </li>
            ))}
          </Box>
          <Typography
            variant="body2"
            color="textSecondary"
            style={{ marginTop: 16 }}
          >
            These hosts will be scanned but results may be inaccurate or all
            rules may return as not applicable.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlatformWarning(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            disabled={launching}
            onClick={() => {
              setPlatformWarning(null);
              setLaunching(true);
              doLaunch();
            }}
          >
            Launch Anyway
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
