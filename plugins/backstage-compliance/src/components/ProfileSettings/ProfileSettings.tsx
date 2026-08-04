import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { InfoCard, Breadcrumbs, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { usePermission } from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';
import {
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  TextField,
  makeStyles,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import EditIcon from '@material-ui/icons/Edit';
import SettingsIcon from '@material-ui/icons/Settings';
import { complianceApiRef } from '../../api';
import { CertificationBadge } from '../shared/CertificationBadge';
import { STATUS_COLORS } from '../shared/colors';
import { ProfileFormDialog } from './ProfileFormDialog';
import { useDynamicTabRefresh } from '../ComplianceRouter';

import type {
  ComplianceProfile,
  SaveProfileRequest,
} from '@ansible/backstage-compliance-common/types';
import { FRAMEWORK_OPTIONS } from '@ansible/backstage-compliance-common/types';

const useStyles = makeStyles(theme => ({
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  emptyState: {
    textAlign: 'center',
    padding: theme.spacing(6),
  },
  frameworkChip: {
    fontWeight: 600,
  },
}));

interface WorkflowTemplate {
  id: number;
  name: string;
  description: string;
}

interface ExecutionEnvironment {
  id: number;
  name: string;
  image: string;
}

const DataRetentionSettings = () => {
  const api = useApi(complianceApiRef);
  const [retentionDays, setRetentionDays] = useState(90);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  useEffect(() => {
    api
      .getHealth()
      .then(h => {
        if (h.retentionDays) {
          setRetentionDays(h.retentionDays);
        }
      })
      .catch(() => {});
  }, [api]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.updateSettings({ retentionDays });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // Best effort
    } finally {
      setSaving(false);
    }
  };

  const handleCleanup = async () => {
    setCleaning(true);
    setCleanupResult(null);
    try {
      const data = await api.runCleanup();
      setCleanupResult(`Cleaned up ${data.deleted ?? 0} old findings`);
    } catch {
      setCleanupResult('Cleanup failed');
    } finally {
      setCleaning(false);
    }
  };

  return (
    <Box>
      <Typography variant="body2" color="textSecondary" paragraph>
        Configure how long scan findings are retained. Older findings are
        automatically cleaned up on startup. Scan records are preserved for
        history.
      </Typography>
      <Box display="flex" alignItems="center" style={{ gap: 16 }}>
        <TextField
          label="Retention Period (days)"
          type="number"
          variant="outlined"
          size="small"
          value={retentionDays}
          onChange={e => setRetentionDays(Number(e.target.value))}
          inputProps={{ min: 7, max: 365 }}
          style={{ width: 200 }}
        />
        <Button variant="outlined" onClick={handleSave} disabled={saving}>
          {(() => {
            if (saving) return 'Saving...';
            if (saved) return 'Saved ✓';
            return 'Save';
          })()}
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          onClick={handleCleanup}
          disabled={cleaning}
        >
          {cleaning ? 'Cleaning...' : 'Run Cleanup Now'}
        </Button>
      </Box>
      {cleanupResult && (
        <Typography
          variant="body2"
          color="textSecondary"
          style={{ marginTop: 8 }}
        >
          {cleanupResult}
        </Typography>
      )}
    </Box>
  );
};

export const ProfileSettings = () => {
  const classes = useStyles();
  const navigate = useNavigate();
  const api = useApi(complianceApiRef);

  const { allowed: isAdmin, loading: permissionLoading } = usePermission({
    permission: catalogEntityCreatePermission,
  });

  const [profiles, setProfiles] = useState<ComplianceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<ComplianceProfile | null>(
    null,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ComplianceProfile | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [workflowTemplates, setWorkflowTemplates] = useState<
    WorkflowTemplate[]
  >([]);
  const [executionEnvironments, setExecutionEnvironments] = useState<
    ExecutionEnvironment[]
  >([]);

  const loadProfiles = useCallback(async () => {
    try {
      const data = await api.getRegisteredProfiles({
        includeDisconnected: true,
      });
      setProfiles(data);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to load profiles:', err);
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadControllerResources = useCallback(async () => {
    try {
      const [wfts, jts, ees] = await Promise.all([
        api.getControllerWorkflowTemplates(),
        api.getControllerJobTemplates(),
        api.getControllerExecutionEnvironments(),
      ]);
      setWorkflowTemplates([...jts, ...wfts]);
      setExecutionEnvironments(ees);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to load controller resources:', err);
    }
  }, [api]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handleOpenDialog = () => {
    setEditProfile(null);
    loadControllerResources();
    setDialogOpen(true);
  };

  const handleEditClick = async (profile: ComplianceProfile) => {
    const fresh = await api.getRegisteredProfile(profile.id);
    if (!fresh) {
      await loadProfiles();
      return;
    }
    setEditProfile(fresh);
    loadControllerResources();
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditProfile(null);
  };

  const refreshTabs = useDynamicTabRefresh();

  const handleSave = async (request: SaveProfileRequest) => {
    await api.saveRegisteredProfile(request);
    handleCloseDialog();
    await loadProfiles();
    if (request.displayConfig?.tab) {
      refreshTabs?.();
    }
  };

  const handleDeleteClick = (profile: ComplianceProfile) => {
    setDeleteTarget(profile);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      const hadTab = deleteTarget.displayConfig?.tab;
      await api.disconnectProfile(deleteTarget.id);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      await loadProfiles();
      if (hadTab) refreshTabs?.();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Failed to disconnect profile',
      );
    }
  };

  const getFrameworkLabel = (value: string) => {
    return FRAMEWORK_OPTIONS.find(f => f.value === value)?.label ?? value;
  };

  if (permissionLoading || loading) {
    return <Progress />;
  }

  if (!isAdmin) {
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
          <Typography>Settings</Typography>
        </Breadcrumbs>
        <Box mt={3} />
        <InfoCard title="Access Denied">
          <Typography variant="body1">
            You do not have permission to manage compliance profiles. Contact
            your administrator if you need access.
          </Typography>
        </InfoCard>
      </>
    );
  }

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
        <Typography>Settings</Typography>
      </Breadcrumbs>

      <Box mt={3} />

      <InfoCard title="Compliance Profiles">
        <div className={classes.headerRow}>
          <Typography variant="body2" color="textSecondary">
            Each profile maps a compliance standard (e.g., DISA STIG, CIS) to an
            automation controller workflow job template and execution
            environment.
          </Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleOpenDialog}
          >
            Add Profile
          </Button>
        </div>

        {profiles.filter(p => p.connectionStatus !== 'disconnected').length ===
        0 ? (
          <div className={classes.emptyState}>
            <SettingsIcon
              style={{
                fontSize: 64,
                color: STATUS_COLORS.neutral,
                marginBottom: 16,
              }}
            />
            <Typography variant="h6" color="textSecondary" gutterBottom>
              No compliance profiles configured
            </Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              A compliance profile maps a standard (e.g., DISA STIG for RHEL 9)
              to a workflow job template and execution environment so you can
              scan and remediate from the portal.
            </Typography>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={handleOpenDialog}
            >
              Add Compliance Profile
            </Button>
          </div>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Framework</TableCell>
                  <TableCell>Certification</TableCell>
                  <TableCell>Version</TableCell>
                  <TableCell>Platform</TableCell>
                  <TableCell>Scan Job Template</TableCell>
                  <TableCell>Remediate Job Template</TableCell>
                  <TableCell>Execution Environment</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {profiles
                  .filter(c => c.connectionStatus !== 'disconnected')
                  .map(c => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Typography variant="body2" style={{ fontWeight: 500 }}>
                          {c.displayName}
                        </Typography>
                        {c.profileSlug && (
                          <Typography
                            variant="caption"
                            color="textSecondary"
                            style={{ fontFamily: 'monospace' }}
                          >
                            {c.profileSlug}
                          </Typography>
                        )}
                        {c.description && !c.profileSlug && (
                          <Typography variant="caption" color="textSecondary">
                            {c.description}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getFrameworkLabel(c.framework)}
                          size="small"
                          variant="outlined"
                          className={classes.frameworkChip}
                        />
                      </TableCell>
                      <TableCell>
                        <CertificationBadge certification={c.certification} />
                      </TableCell>
                      <TableCell>{c.version || '--'}</TableCell>
                      <TableCell>{c.platform || '--'}</TableCell>
                      <TableCell>
                        {c.workflowTemplateId
                          ? `ID ${c.workflowTemplateId}`
                          : '--'}
                      </TableCell>
                      <TableCell>
                        {c.remediateJtId ? `ID ${c.remediateJtId}` : 'Auto'}
                      </TableCell>
                      <TableCell>{c.eeId ? `ID ${c.eeId}` : '--'}</TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => handleEditClick(c)}
                          aria-label="edit compliance profile"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteClick(c)}
                          aria-label="delete compliance profile"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </InfoCard>

      <ProfileFormDialog
        open={dialogOpen}
        editProfile={editProfile}
        workflowTemplates={workflowTemplates}
        executionEnvironments={executionEnvironments}
        onClose={handleCloseDialog}
        onSave={handleSave}
      />

      <Box mt={4} />
      <InfoCard title="Data Management">
        <DataRetentionSettings />
      </InfoCard>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Disconnect Compliance Profile</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to disconnect the compliance profile{' '}
            <strong>{deleteTarget?.displayName}</strong>? Existing scan results
            and remediation history will be preserved. You can reconnect the
            profile later by re-adding it from the same framework.
          </Typography>
          {deleteError && (
            <Typography color="error" variant="body2" style={{ marginTop: 8 }}>
              {deleteError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleDeleteConfirm}
          >
            Disconnect
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
