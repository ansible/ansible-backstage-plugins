import { useState, useEffect, useRef } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  TextField,
  Box,
  makeStyles,
} from '@material-ui/core';
import Autocomplete from '@material-ui/lab/Autocomplete';
import { complianceApiRef } from '../../api';

import type {
  ComplianceProfile,
  SaveProfileRequest,
  CertificationStatus,
} from '@ansible/backstage-compliance-common/types';
import { FRAMEWORK_OPTIONS } from '@ansible/backstage-compliance-common/types';

const useStyles = makeStyles(theme => ({
  formField: {
    marginBottom: theme.spacing(2),
  },
  dialogContent: {
    minWidth: 500,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
    paddingTop: theme.spacing(1),
  },
}));

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 128);
}

const EMPTY_FORM: SaveProfileRequest = {
  profileSlug: '',
  displayName: '',
  description: '',
  framework: 'DISA_STIG',
  version: '',
  platform: '',
  platformSpec: null,
  workflowTemplateId: null,
  remediateJtId: null,
  eeId: null,
  remediationPlaybookPath: '',
  scanTags: '',
};

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

interface ProfileFormDialogProps {
  open: boolean;
  editProfile: ComplianceProfile | null;
  workflowTemplates: WorkflowTemplate[];
  executionEnvironments: ExecutionEnvironment[];
  onClose: () => void;
  onSave: (request: SaveProfileRequest) => Promise<void>;
}

export const ProfileFormDialog = ({
  open,
  editProfile,
  workflowTemplates,
  executionEnvironments,
  onClose,
  onSave,
}: ProfileFormDialogProps) => {
  const classes = useStyles();
  const api = useApi(complianceApiRef);

  const [form, setForm] = useState<SaveProfileRequest>({ ...EMPTY_FORM });
  const [certStatus, setCertStatus] = useState('uncertified');
  const [certAuthority, setCertAuthority] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [autoPopulateEnabled, setAutoPopulateEnabled] = useState(false);
  const skipNextAutoPopulateRef = useRef(false);
  const [pendingAutoPopulate, setPendingAutoPopulate] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [detectedEeId, setDetectedEeId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setAutoPopulateEnabled(false);
      setPendingAutoPopulate(null);
      setDetectedEeId(null);
      return;
    }
    if (editProfile) {
      setAutoPopulateEnabled(false);
      setForm({
        profileSlug: editProfile.profileSlug,
        displayName: editProfile.displayName,
        description: editProfile.description,
        framework: editProfile.framework,
        version: editProfile.version,
        platform: editProfile.platform,
        platformSpec: editProfile.platformSpec ?? null,
        workflowTemplateId: editProfile.workflowTemplateId,
        remediateJtId: editProfile.remediateJtId,
        eeId: editProfile.eeId,
        remediationPlaybookPath: editProfile.remediationPlaybookPath,
        scanTags: editProfile.scanTags,
      });
      setCertStatus(editProfile.certification?.status || 'uncertified');
      setCertAuthority(editProfile.certification?.authority || '');
      skipNextAutoPopulateRef.current = true;
      setAutoPopulateEnabled(true);
    } else {
      setForm({ ...EMPTY_FORM });
      setCertStatus('uncertified');
      setCertAuthority('');
      setAutoPopulateEnabled(true);
    }
    setSaveError(null);
  }, [open, editProfile]);

  useEffect(() => {
    if (!autoPopulateEnabled || !form.workflowTemplateId) return undefined;
    if (skipNextAutoPopulateRef.current) {
      skipNextAutoPopulateRef.current = false;
      return undefined;
    }
    let cancelled = false;
    api
      .getJobTemplateDetail(form.workflowTemplateId)
      .then(detail => {
        if (cancelled) return;
        try {
          const vars = JSON.parse(detail.extra_vars || '{}');
          if (detail.execution_environment) {
            setDetectedEeId(detail.execution_environment);
          }
          if (Object.keys(vars).length > 0) {
            setPendingAutoPopulate(vars);
          }
        } catch {
          // extra_vars not valid JSON
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api, form.workflowTemplateId, autoPopulateEnabled]);

  const applyAutoPopulate = (vars: Record<string, unknown>) => {
    const remediateJtName = vars.remediate_jt_name as string | undefined;
    const matchedRemediateJt = remediateJtName
      ? workflowTemplates.find(t => t.name === remediateJtName)
      : undefined;

    const displayConfig = vars.display_config as
      | Record<string, unknown>
      | undefined;

    setForm(prev => ({
      ...prev,
      profileSlug:
        (vars.profile_slug as string) ||
        prev.profileSlug ||
        slugify((vars.profile_name as string) || prev.displayName),
      displayName: (vars.profile_name as string) || prev.displayName,
      description: (vars.description as string) || prev.description,
      framework: (vars.framework as string) || prev.framework,
      version: (vars.version as string) || prev.version,
      platform: (vars.platform as string) || prev.platform,
      remediationPlaybookPath:
        (vars.remediation_playbook as string) || prev.remediationPlaybookPath,
      remediateJtId: matchedRemediateJt?.id ?? prev.remediateJtId,
      eeId: detectedEeId ?? prev.eeId,
      platformSpec: {
        ...prev.platformSpec,
        os_family: (vars.os_family as string[]) || prev.platformSpec?.os_family,
        os_version:
          (vars.os_version as string[]) || prev.platformSpec?.os_version,
      },
      ...(displayConfig && typeof displayConfig === 'object'
        ? {
            displayConfig:
              displayConfig as import('@ansible/backstage-compliance-common').ProfileDisplayConfig,
          }
        : {}),
    }));
    if (
      vars.certification_status &&
      ['certified', 'conformant', 'uncertified'].includes(
        vars.certification_status as string,
      )
    ) {
      setCertStatus(vars.certification_status as string);
    }
    if (vars.certification_authority) {
      setCertAuthority(vars.certification_authority as string);
    }
    setPendingAutoPopulate(null);
  };

  const updateForm = (field: keyof SaveProfileRequest, value: unknown) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const certification = {
        status: certStatus as CertificationStatus,
        authority: certAuthority,
        validationId: '',
        disclaimer: '',
      };
      const payload = editProfile
        ? { ...form, id: editProfile.id, certification }
        : { ...form, certification };
      await onSave(payload);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to save profile',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editProfile ? 'Edit Compliance Profile' : 'Add Compliance Profile'}
        </DialogTitle>
        <DialogContent>
          <div className={classes.dialogContent}>
            <Typography variant="subtitle2" style={{ marginBottom: 4 }}>
              Profile Discovery
            </Typography>
            <Typography
              variant="caption"
              color="textSecondary"
              style={{ marginBottom: 8 }}
            >
              Select a scan job template to auto-detect profile configuration
              from its default extra_vars.
            </Typography>

            <FormControl
              variant="outlined"
              fullWidth
              className={classes.formField}
            >
              <InputLabel>Scan Job Template</InputLabel>
              <Select
                value={form.workflowTemplateId ?? ''}
                onChange={e => {
                  const val = e.target.value;
                  updateForm(
                    'workflowTemplateId',
                    val === '' ? null : Number(val),
                  );
                }}
                label="Scan Job Template"
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {workflowTemplates.map(t => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl
              variant="outlined"
              fullWidth
              className={classes.formField}
            >
              <InputLabel>Remediate Job Template</InputLabel>
              <Select
                value={form.remediateJtId ?? ''}
                onChange={e => {
                  const val = e.target.value;
                  updateForm('remediateJtId', val === '' ? null : Number(val));
                }}
                label="Remediate Job Template"
              >
                <MenuItem value="">
                  <em>None (auto-detect)</em>
                </MenuItem>
                {workflowTemplates.map(t => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl
              variant="outlined"
              fullWidth
              className={classes.formField}
            >
              <InputLabel>Execution Environment</InputLabel>
              <Select
                value={form.eeId ?? ''}
                onChange={e => {
                  const val = e.target.value;
                  updateForm('eeId', val === '' ? null : Number(val));
                }}
                label="Execution Environment"
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {executionEnvironments.map(ee => (
                  <MenuItem key={ee.id} value={ee.id}>
                    {ee.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Remediation Playbook Path"
              variant="outlined"
              fullWidth
              placeholder="/usr/share/scap-security-guide/ansible/rhel9-playbook-stig.yml"
              value={form.remediationPlaybookPath}
              onChange={e =>
                updateForm('remediationPlaybookPath', e.target.value)
              }
              helperText="Path inside the EE to the CaC remediation playbook"
              className={classes.formField}
            />

            <Typography
              variant="subtitle2"
              style={{ marginTop: 16, marginBottom: 4 }}
            >
              Profile Details
            </Typography>

            <TextField
              label="Profile Name"
              variant="outlined"
              fullWidth
              required
              value={form.displayName}
              onChange={e => {
                updateForm('displayName', e.target.value);
                if (!editProfile && !form.profileSlug) {
                  updateForm('profileSlug', slugify(e.target.value));
                }
              }}
              helperText="e.g. 'DISA STIG for RHEL 9', 'CIS Benchmark RHEL 9 Level 1'"
              className={classes.formField}
            />

            <TextField
              label="Profile Slug"
              variant="outlined"
              fullWidth
              value={form.profileSlug ?? ''}
              onChange={e => updateForm('profileSlug', e.target.value)}
              helperText={
                editProfile
                  ? 'Slug is immutable after creation'
                  : 'Stable identifier for reconnect — auto-derived from name'
              }
              disabled={!!editProfile}
              className={classes.formField}
            />

            <TextField
              label="Description"
              variant="outlined"
              fullWidth
              multiline
              rows={2}
              value={form.description}
              onChange={e => updateForm('description', e.target.value)}
              className={classes.formField}
            />

            <Autocomplete
              freeSolo
              options={FRAMEWORK_OPTIONS.map(f => f.value)}
              getOptionLabel={opt => {
                const found = FRAMEWORK_OPTIONS.find(f => f.value === opt);
                return found ? found.label : String(opt);
              }}
              value={form.framework}
              onChange={(_, val) => updateForm('framework', val || '')}
              onInputChange={(_, val, reason) => {
                if (reason === 'input') updateForm('framework', val);
              }}
              renderInput={params => (
                <TextField
                  {...params}
                  label="Compliance Standard"
                  variant="outlined"
                  placeholder="e.g., DISA STIG, CIS, SOC2"
                  className={classes.formField}
                />
              )}
            />

            <TextField
              label="Standard Version"
              variant="outlined"
              fullWidth
              placeholder="e.g., V2R8"
              value={form.version}
              onChange={e => updateForm('version', e.target.value)}
              className={classes.formField}
            />

            <TextField
              label="Target Platform"
              variant="outlined"
              fullWidth
              placeholder="e.g., RHEL 9"
              value={form.platform}
              onChange={e => updateForm('platform', e.target.value)}
              className={classes.formField}
            />

            <Typography
              variant="subtitle2"
              style={{ marginTop: 16, marginBottom: 4 }}
            >
              Platform Guards
            </Typography>

            <TextField
              label="OS Family"
              variant="outlined"
              fullWidth
              value={form.platformSpec?.os_family?.join(', ') || ''}
              onChange={e => {
                const val = e.target.value;
                setForm(prev => ({
                  ...prev,
                  platformSpec: {
                    ...prev.platformSpec,
                    os_family: val
                      ? val
                          .split(',')
                          .map(s => s.trim())
                          .filter(Boolean)
                      : undefined,
                  },
                }));
              }}
              helperText="Comma-separated: RedHat, Windows, etc."
              className={classes.formField}
            />

            <TextField
              label="OS Version"
              variant="outlined"
              fullWidth
              value={form.platformSpec?.os_version?.join(', ') || ''}
              onChange={e => {
                const val = e.target.value;
                setForm(prev => ({
                  ...prev,
                  platformSpec: {
                    ...prev.platformSpec,
                    os_version: val
                      ? val
                          .split(',')
                          .map(s => s.trim())
                          .filter(Boolean)
                      : undefined,
                  },
                }));
              }}
              helperText="Comma-separated: 9, 8, 2022, etc."
              className={classes.formField}
            />

            <TextField
              label="Device Type"
              variant="outlined"
              fullWidth
              value={form.platformSpec?.device_type?.join(', ') || ''}
              onChange={e => {
                const val = e.target.value;
                setForm(prev => ({
                  ...prev,
                  platformSpec: {
                    ...prev.platformSpec,
                    device_type: val
                      ? val
                          .split(',')
                          .map(s => s.trim())
                          .filter(Boolean)
                      : undefined,
                  },
                }));
              }}
              helperText="For network profiles: cisco_ios, cisco_nxos, etc."
              className={classes.formField}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={form.platformSpec?.scanner_validates || false}
                  onChange={e => {
                    setForm(prev => ({
                      ...prev,
                      platformSpec: {
                        ...prev.platformSpec,
                        scanner_validates: e.target.checked || undefined,
                      },
                    }));
                  }}
                />
              }
              label="External scanner handles platform validation"
            />

            <Typography
              variant="subtitle2"
              style={{ marginTop: 16, marginBottom: 4 }}
            >
              Certification &amp; Advanced
            </Typography>

            <TextField
              select
              label="Certification Status"
              value={certStatus}
              onChange={e => setCertStatus(e.target.value)}
              fullWidth
              size="small"
              className={classes.formField}
            >
              <MenuItem value="uncertified">Custom</MenuItem>
              <MenuItem value="conformant">Conformant</MenuItem>
              <MenuItem value="certified">Certified</MenuItem>
            </TextField>
            {certStatus !== 'uncertified' && (
              <TextField
                label="Certification Authority"
                value={certAuthority}
                onChange={e => setCertAuthority(e.target.value)}
                fullWidth
                size="small"
                helperText="e.g. NIST SCAP 1.2, CIS"
                className={classes.formField}
              />
            )}

            <TextField
              label="Scan Tags"
              variant="outlined"
              fullWidth
              placeholder="e.g., sshd_set_idle_timeout, accounts_tmout"
              value={form.scanTags}
              onChange={e => updateForm('scanTags', e.target.value)}
              helperText="Optional. Comma-separated rule IDs to limit which rules are scanned."
              className={classes.formField}
            />
          </div>
          {saveError && (
            <Typography color="error" variant="body2" style={{ marginTop: 8 }}>
              {saveError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSave}
            disabled={saving || !form.displayName || !form.framework}
          >
            {(() => {
              if (saving) return 'Saving...';
              if (editProfile) return 'Update';
              return 'Save';
            })()}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={pendingAutoPopulate !== null}
        onClose={() => setPendingAutoPopulate(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Apply Profile Configuration?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Automatic configuration data was detected from the selected job
            template's default extra_vars. Applying will overwrite the current
            form values.
          </Typography>
          {pendingAutoPopulate && (
            <Box
              mt={2}
              p={1.5}
              bgcolor="#f5f5f5"
              borderRadius={4}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            >
              {Object.entries(pendingAutoPopulate)
                .filter(([, v]) => v !== undefined && v !== null && v !== '')
                .map(([k, v]) => (
                  <div key={k}>
                    {k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </div>
                ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingAutoPopulate(null)}>
            Keep Manual Values
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() =>
              pendingAutoPopulate && applyAutoPopulate(pendingAutoPopulate)
            }
          >
            Apply Configuration
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
