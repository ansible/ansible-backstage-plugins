import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Content, ContentHeader } from '@backstage/core-components';
import {
  Box, Button, Card, CardContent, Chip, Collapse, Grid,
  IconButton, LinearProgress, List, ListItem, ListItemText,
  Typography,
} from '@material-ui/core';
import DeleteIcon from '@material-ui/icons/Delete';
import CloudUploadIcon from '@material-ui/icons/CloudUpload';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import RefreshIcon from '@material-ui/icons/Refresh';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import GetAppIcon from '@material-ui/icons/GetApp';

import {
  getPersistedSession,
  useSessionStream,
  type Patch,
  type SessionResult,
  type Tier1Result,
} from '../hooks/useSessionStream';

const AI_MODEL_STORAGE_KEY = 'apme-ai-model';

export const PlaygroundPage = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [ansibleVersion, setAnsibleVersion] = useState('');
  const [collections, setCollections] = useState('');
  const [enableAi, setEnableAi] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  const {
    status: rawStatus, progress, sessionId, scanId,
    tier1, proposals, result, error, canReconnect,
    startSession, resumeSession, approve, cancel, reset,
  } = useSessionStream();

  const resumeAttempted = useRef(false);
  useEffect(() => {
    if (resumeAttempted.current || rawStatus !== 'idle') return;
    resumeAttempted.current = true;
    const persisted = getPersistedSession();
    if (persisted) resumeSession(persisted.sessionId, persisted.scanId);
  }, [rawStatus, resumeSession]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    if (rawStatus !== 'idle') return;
    setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
  }, [rawStatus]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    e.target.value = '';
  }, []);

  const removeFile = useCallback((idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSubmit = useCallback(() => {
    if (files.length === 0) return;
    const colls = collections.split(',').map(c => c.trim()).filter(Boolean);
    startSession(files, {
      ansibleVersion,
      collections: colls.length ? colls : undefined,
      enableAi,
      aiModel: enableAi ? (localStorage.getItem(AI_MODEL_STORAGE_KEY) ?? undefined) : undefined,
    });
  }, [files, ansibleVersion, collections, enableAi, startSession]);

  const handleReset = useCallback(() => { reset(); setFiles([]); }, [reset]);

  const isRunning = rawStatus === 'connecting' || rawStatus === 'uploading' || rawStatus === 'checking' || rawStatus === 'applying';
  const [dismissedDisconnect, setDismissedDisconnect] = useState(false);

  const handleReconnect = useCallback(() => {
    if (sessionId && scanId) resumeSession(sessionId, scanId);
  }, [sessionId, scanId, resumeSession]);

  return (
    <Content>
      <ContentHeader title="Playground" />

      {rawStatus === 'disconnected' && canReconnect && !dismissedDisconnect && (
        <Box mb={2}>
          <Card style={{ borderLeft: '4px solid #ff9800' }}>
            <CardContent>
              <Typography variant="subtitle1">Session disconnected</Typography>
              <Typography variant="body2" color="textSecondary">{error}</Typography>
              <Box mt={1}>
                <Button variant="contained" color="primary" size="small" onClick={handleReconnect}>Reconnect</Button>
                {' '}
                <Button size="small" onClick={handleReset}>Start Over</Button>
                {' '}
                <Button size="small" onClick={() => setDismissedDisconnect(true)}>Dismiss</Button>
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}

      {rawStatus === 'idle' && (
        <Card>
          <CardContent>
            <Box
              onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragOver ? '#1976d2' : '#555'}`,
                borderRadius: 8, padding: 48, textAlign: 'center',
                cursor: 'pointer', background: isDragOver ? 'rgba(25,118,210,0.05)' : undefined,
                transition: 'all 0.2s',
              }}
            >
              <CloudUploadIcon style={{ fontSize: 48, opacity: 0.5 }} />
              <Typography variant="h6" style={{ marginTop: 8 }}>Drop Ansible files here or click to browse</Typography>
              <Typography variant="body2" color="textSecondary">Supports individual files or entire directories</Typography>
              <input ref={fileInputRef} type="file" multiple accept=".yml,.yaml,.json,.j2,.jinja2,.cfg,.ini,.toml,.py,.sh" style={{ display: 'none' }} onChange={handleFileSelect} />
            </Box>
            <Box mt={1}>
              <Button variant="outlined" size="small" onClick={() => dirInputRef.current?.click()}>Select Directory</Button>
              {/* @ts-expect-error webkitdirectory is non-standard */}
              <input ref={dirInputRef} type="file" webkitdirectory="" style={{ display: 'none' }} onChange={handleFileSelect} />
            </Box>
            {files.length > 0 && (
              <Box mt={2}>
                <Typography variant="subtitle2">{files.length} file{files.length !== 1 ? 's' : ''} selected</Typography>
                <List dense>
                  {files.map((f, i) => (
                    <ListItem key={`${f.name}-${i}`}>
                      <ListItemText
                        primary={(f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name}
                        secondary={`${(f.size / 1024).toFixed(1)} KB`}
                      />
                      <IconButton size="small" onClick={() => removeFile(i)} aria-label={`Remove ${f.name}`}><DeleteIcon fontSize="small" /></IconButton>
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
            <Box mt={2}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <Typography variant="caption">Ansible Version (optional)</Typography>
                  <input value={ansibleVersion} onChange={e => setAnsibleVersion(e.target.value)} placeholder="e.g. 2.15" style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #555', background: 'transparent', color: 'inherit' }} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Typography variant="caption">Collections (comma-separated)</Typography>
                  <input value={collections} onChange={e => setCollections(e.target.value)} placeholder="e.g. ansible.builtin" style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #555', background: 'transparent', color: 'inherit' }} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Typography variant="caption">AI Remediation</Typography>
                  <Box>
                    <label style={{ cursor: 'pointer' }}>
                      <input type="checkbox" checked={enableAi} onChange={e => setEnableAi(e.target.checked)} /> Enable AI-assisted fixes
                    </label>
                  </Box>
                </Grid>
              </Grid>
            </Box>
            <Box mt={2}>
              <Button variant="contained" color="primary" disabled={files.length === 0} onClick={handleSubmit} startIcon={<PlayArrowIcon />}>
                Start Check
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {isRunning && (
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" mb={1}>
              <Typography variant="h6" style={{ flex: 1 }}>
                {rawStatus === 'connecting' ? 'Connecting...' : rawStatus === 'uploading' ? 'Uploading files...' : rawStatus === 'checking' ? 'Checking...' : 'Applying...'}
              </Typography>
              <Button size="small" onClick={cancel}>Cancel</Button>
            </Box>
            <LinearProgress />
            {progress.length > 0 && (
              <List dense style={{ maxHeight: 200, overflow: 'auto', marginTop: 8 }}>
                {progress.map((p, i) => (
                  <ListItem key={i}>
                    <ListItemText primary={p.message} secondary={p.phase} />
                  </ListItem>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      )}

      {rawStatus === 'tier1_done' && tier1 && <Tier1Panel tier1={tier1} />}

      {rawStatus === 'awaiting_approval' && proposals.length > 0 && (
        <>
          {tier1 && <Tier1Panel tier1={tier1} />}
          <ProposalPanel proposals={proposals} onApprove={approve} />
        </>
      )}

      {rawStatus === 'complete' && result && (
        <SessionComplete result={result} scanId={scanId} tier1={tier1} onReset={handleReset} />
      )}
      {rawStatus === 'complete' && !result && (
        <Card style={{ textAlign: 'center' }}>
          <CardContent>
            <CheckCircleIcon style={{ fontSize: 48, color: '#4caf50' }} />
            <Typography variant="h5">Check Complete</Typography>
            <Button variant="contained" color="primary" onClick={handleReset} style={{ marginTop: 16 }}>Check More Files</Button>
          </CardContent>
        </Card>
      )}

      {rawStatus === 'error' && (
        <Card style={{ textAlign: 'center' }}>
          <CardContent>
            <ErrorIcon style={{ fontSize: 48, color: '#f44336' }} />
            <Typography variant="h5" color="error">Check Failed</Typography>
            <Typography color="textSecondary">{error}</Typography>
            <Button variant="contained" color="primary" onClick={handleReset} style={{ marginTop: 16 }}>Try Again</Button>
          </CardContent>
        </Card>
      )}
    </Content>
  );
};

function Tier1Panel({ tier1 }: { tier1: Tier1Result }) {
  return (
    <Box mb={2}>
      <Card>
        <CardContent>
          <Typography variant="h6">Tier 1 Results (Deterministic)</Typography>
          <Typography variant="body2">{tier1.patches.length} patches applied, {tier1.format_diffs.length} format changes</Typography>
          {tier1.patches.map((p, i) => (
            <Box key={i} mt={1} p={1} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
              <Typography variant="subtitle2">{p.file}</Typography>
              <Typography variant="caption" color="textSecondary">Rules: {p.applied_rules.join(', ')}</Typography>
              {p.diff && <pre style={{ fontSize: 11, overflow: 'auto', maxHeight: 150 }}>{p.diff}</pre>}
            </Box>
          ))}
        </CardContent>
      </Card>
    </Box>
  );
}

function ProposalPanel({ proposals, onApprove }: { proposals: any[]; onApprove: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(proposals.map(p => p.id)));

  const toggleAll = () => {
    if (selected.size === proposals.length) setSelected(new Set());
    else setSelected(new Set(proposals.map(p => p.id)));
  };

  const toggle = (id: string) => {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  return (
    <Box mb={2}>
      <Card>
        <CardContent>
          <Box display="flex" alignItems="center" mb={1}>
            <Typography variant="h6" style={{ flex: 1 }}>AI Proposals ({proposals.length})</Typography>
            <Button size="small" onClick={toggleAll}>{selected.size === proposals.length ? 'Deselect All' : 'Select All'}</Button>
            <Button variant="contained" color="primary" size="small" onClick={() => onApprove(Array.from(selected))} disabled={selected.size === 0} style={{ marginLeft: 8 }}>
              Approve {selected.size} proposal{selected.size !== 1 ? 's' : ''}
            </Button>
          </Box>
          {proposals.map(p => (
            <Box key={p.id} p={1} mb={1} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 4, cursor: 'pointer' }} onClick={() => toggle(p.id)}>
              <Box display="flex" alignItems="center">
                <input type="checkbox" checked={selected.has(p.id)} readOnly style={{ marginRight: 8 }} />
                <Chip label={p.rule_id} size="small" style={{ marginRight: 8 }} />
                <Typography variant="body2" style={{ flex: 1 }}>{p.file}</Typography>
                <Chip label={`${Math.round(p.confidence * 100)}%`} size="small" variant="outlined" />
              </Box>
              {p.explanation && <Typography variant="caption" color="textSecondary" style={{ marginTop: 4, display: 'block' }}>{p.explanation}</Typography>}
              {p.diff_hunk && <pre style={{ fontSize: 11, overflow: 'auto', maxHeight: 150, marginTop: 4 }}>{p.diff_hunk}</pre>}
            </Box>
          ))}
        </CardContent>
      </Card>
    </Box>
  );
}

function SessionComplete({ result, scanId, tier1, onReset }: { result: SessionResult; scanId: string | null; tier1: Tier1Result | null; onReset: () => void }) {
  const totalPatches = result.patches.length + (tier1?.patches.length ?? 0);
  const remaining = result.remaining_violations.length;
  const [showRemaining, setShowRemaining] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const patchedFiles = useMemo(() => {
    const byPath = new Map<string, Patch>();
    for (const p of tier1?.patches ?? []) { if (p.patched) byPath.set(p.file, p); }
    for (const p of result.patches) { if (p.patched) byPath.set(p.file, p); }
    return byPath;
  }, [tier1, result]);

  const handleDownload = useCallback(async () => {
    if (patchedFiles.size === 0) return;
    setDownloading(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (const [path, patch] of patchedFiles) {
        const bytes = Uint8Array.from(atob(patch.patched!), c => c.charCodeAt(0));
        zip.file(path, bytes);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `apme-remediated-${scanId ?? 'files'}.zip`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } finally { setDownloading(false); }
  }, [patchedFiles, scanId]);

  return (
    <Card>
      <CardContent style={{ textAlign: 'center' }}>
        <CheckCircleIcon style={{ fontSize: 48, color: '#4caf50' }} />
        <Typography variant="h5">Check Complete</Typography>
        <Typography color="textSecondary">
          {totalPatches} file{totalPatches !== 1 ? 's' : ''} remediated
          {remaining > 0 && ` · ${remaining} violation${remaining !== 1 ? 's' : ''} remaining`}
        </Typography>
        <Box mt={2} display="flex" justifyContent="center" style={{ gap: 8 }}>
          {patchedFiles.size > 0 && (
            <Button variant="contained" color="primary" onClick={handleDownload} disabled={downloading} startIcon={<GetAppIcon />}>
              {downloading ? 'Preparing...' : `Download Remediated Files (${patchedFiles.size})`}
            </Button>
          )}
          <Button variant="outlined" onClick={onReset} startIcon={<RefreshIcon />}>Check More Files</Button>
        </Box>
        {remaining > 0 && (
          <Box mt={2} style={{ textAlign: 'left', maxWidth: 700, margin: '16px auto 0' }}>
            <Button size="small" onClick={() => setShowRemaining(!showRemaining)} endIcon={<ExpandMoreIcon style={{ transform: showRemaining ? 'rotate(180deg)' : undefined }} />}>
              Remaining Violations ({remaining})
            </Button>
            <Collapse in={showRemaining}>
              <List dense>
                {result.remaining_violations.map((v, i) => (
                  <ListItem key={i}>
                    <Chip label={v.rule_id} size="small" style={{ marginRight: 8 }} />
                    <ListItemText primary={v.message} secondary={v.file} />
                  </ListItem>
                ))}
              </List>
            </Collapse>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
