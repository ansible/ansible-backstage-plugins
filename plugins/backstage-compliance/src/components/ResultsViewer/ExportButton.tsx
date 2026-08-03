/**
 * Data-driven export button for compliance findings (ADR-032).
 *
 * Renders export menu items from profile.displayConfig.export_formats.
 * Supports two export types:
 *   - cff_derived: client-side generation from CFF findings (CSV, JSON, CKL)
 *   - artifact: server-proxied download from PAH OCI registry (SBOMs, etc.)
 *
 * Falls back to CSV + JSON + CKL when no export_formats are declared.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  CircularProgress,
} from '@material-ui/core';
import GetAppIcon from '@material-ui/icons/GetApp';
import DescriptionIcon from '@material-ui/icons/Description';
import CodeIcon from '@material-ui/icons/Code';
import AssignmentTurnedInIcon from '@material-ui/icons/AssignmentTurnedIn';
import CloudDownloadIcon from '@material-ui/icons/CloudDownload';
import { useApi, alertApiRef } from '@backstage/core-plugin-api';
import type {
  MultiHostFinding,
  ProfileDisplayConfig,
  ExportFormatSpec,
  ScanArtifact,
} from '@ansible/backstage-compliance-common/types';

interface ExportButtonProps {
  findings: MultiHostFinding[];
  profileName?: string;
  displayConfig?: ProfileDisplayConfig;
  scanId?: string;
  onDownloadArtifact?: (scanId: string, artifactKey: string, filename: string) => Promise<void>;
  onFetchArtifacts?: (scanId: string) => Promise<ScanArtifact[]>;
}

const DEFAULT_FORMATS: ExportFormatSpec[] = [
  { key: 'csv', label: 'Export as CSV', type: 'cff_derived' },
  { key: 'json', label: 'Export as JSON', type: 'cff_derived' },
  { key: 'ckl', label: 'Export as CKL', type: 'cff_derived', description: 'STIG Viewer checklist' },
];

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCSV(findings: MultiHostFinding[]): string {
  const headers = [
    'Rule ID', 'STIG ID', 'Title', 'Severity', 'Category',
    'Host', 'Status', 'Actual Value', 'Expected Value',
  ];
  const rows: string[] = [headers.join(',')];
  for (const finding of findings) {
    for (const host of finding.hosts) {
      rows.push([
        escapeCSVField(finding.ruleId),
        escapeCSVField(finding.stigId),
        escapeCSVField(finding.title),
        escapeCSVField(finding.severity),
        escapeCSVField(finding.category || ''),
        escapeCSVField(host.host),
        escapeCSVField(host.status),
        escapeCSVField(host.actualValue),
        escapeCSVField(host.expectedValue),
      ].join(','));
    }
  }
  return rows.join('\n');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toCklSeverity(severity: string): string {
  switch (severity) {
    case 'CAT_I': return 'high';
    case 'CAT_II': return 'medium';
    case 'CAT_III': return 'low';
    default: return 'medium';
  }
}

function toCklStatus(status: string): string {
  switch (status) {
    case 'pass': return 'NotAFinding';
    case 'fail': return 'Open';
    case 'error': return 'Not_Reviewed';
    default: return 'Not_Reviewed';
  }
}

export function generateCKL(
  findings: MultiHostFinding[],
  hostname: string,
  profileName: string,
): string {
  const vulnEntries = findings.map(finding => {
    const hostResult = finding.hosts.find(h => h.host === hostname);
    const status = hostResult ? toCklStatus(hostResult.status) : 'Not_Reviewed';
    const details = hostResult
      ? `Actual: ${escapeXml(hostResult.actualValue)}\nExpected: ${escapeXml(hostResult.expectedValue)}`
      : '';
    return `      <VULN>
        <STIG_DATA>
          <VULN_ATTRIBUTE>Vuln_Num</VULN_ATTRIBUTE>
          <ATTRIBUTE_DATA>${escapeXml(finding.stigId || finding.ruleId)}</ATTRIBUTE_DATA>
        </STIG_DATA>
        <STIG_DATA>
          <VULN_ATTRIBUTE>Rule_ID</VULN_ATTRIBUTE>
          <ATTRIBUTE_DATA>${escapeXml(finding.ruleId)}</ATTRIBUTE_DATA>
        </STIG_DATA>
        <STIG_DATA>
          <VULN_ATTRIBUTE>Rule_Title</VULN_ATTRIBUTE>
          <ATTRIBUTE_DATA>${escapeXml(finding.title)}</ATTRIBUTE_DATA>
        </STIG_DATA>
        <STIG_DATA>
          <VULN_ATTRIBUTE>Severity</VULN_ATTRIBUTE>
          <ATTRIBUTE_DATA>${toCklSeverity(finding.severity)}</ATTRIBUTE_DATA>
        </STIG_DATA>
        <STIG_DATA>
          <VULN_ATTRIBUTE>Fix_Text</VULN_ATTRIBUTE>
          <ATTRIBUTE_DATA>${escapeXml(finding.fixText)}</ATTRIBUTE_DATA>
        </STIG_DATA>
        <STIG_DATA>
          <VULN_ATTRIBUTE>Check_Content</VULN_ATTRIBUTE>
          <ATTRIBUTE_DATA>${escapeXml(finding.checkText)}</ATTRIBUTE_DATA>
        </STIG_DATA>
        <STATUS>${status}</STATUS>
        <FINDING_DETAILS>${details}</FINDING_DETAILS>
        <COMMENTS></COMMENTS>
        <SEVERITY_OVERRIDE></SEVERITY_OVERRIDE>
        <SEVERITY_JUSTIFICATION></SEVERITY_JUSTIFICATION>
      </VULN>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<CHECKLIST>
  <ASSET>
    <ROLE>None</ROLE>
    <ASSET_TYPE>Computing</ASSET_TYPE>
    <HOST_NAME>${escapeXml(hostname)}</HOST_NAME>
    <HOST_IP></HOST_IP>
    <HOST_MAC></HOST_MAC>
    <HOST_FQDN></HOST_FQDN>
    <TARGET_COMMENT></TARGET_COMMENT>
    <TECH_AREA></TECH_AREA>
    <TARGET_KEY></TARGET_KEY>
    <WEB_OR_DATABASE>false</WEB_OR_DATABASE>
    <WEB_DB_SITE></WEB_DB_SITE>
    <WEB_DB_INSTANCE></WEB_DB_INSTANCE>
  </ASSET>
  <STIGS>
    <iSTIG>
      <STIG_INFO>
        <SI_DATA>
          <SID_NAME>title</SID_NAME>
          <SID_DATA>${escapeXml(profileName || 'Compliance Scan')}</SID_DATA>
        </SI_DATA>
        <SI_DATA>
          <SID_NAME>version</SID_NAME>
          <SID_DATA></SID_DATA>
        </SI_DATA>
      </STIG_INFO>
${vulnEntries.join('\n')}
    </iSTIG>
  </STIGS>
</CHECKLIST>`;
}

function getDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function getFormatIcon(fmt: ExportFormatSpec) {
  if (fmt.type === 'artifact') return <CloudDownloadIcon fontSize="small" />;
  switch (fmt.key) {
    case 'csv': return <DescriptionIcon fontSize="small" />;
    case 'json': return <CodeIcon fontSize="small" />;
    case 'ckl': return <AssignmentTurnedInIcon fontSize="small" />;
    default: return <GetAppIcon fontSize="small" />;
  }
}

export const ExportButton = ({
  findings,
  profileName,
  displayConfig,
  scanId,
  onDownloadArtifact,
  onFetchArtifacts,
}: ExportButtonProps) => {
  const alertApi = useApi(alertApiRef);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [artifacts, setArtifacts] = useState<ScanArtifact[]>([]);
  const [downloading, setDownloading] = useState(false);

  const formats = displayConfig?.export_formats ?? DEFAULT_FORMATS;

  useEffect(() => {
    if (scanId && onFetchArtifacts) {
      onFetchArtifacts(scanId).then(setArtifacts).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        alertApi.post({ message: `Failed to load export artifacts: ${msg}`, severity: 'warning' });
        setArtifacts([]);
      });
    }
  }, [scanId, onFetchArtifacts, alertApi]);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const safeName = (profileName || 'scan').replace(/[^a-zA-Z0-9_-]/g, '_');

  const handleCffExport = useCallback((fmt: ExportFormatSpec) => {
    switch (fmt.key) {
      case 'csv': {
        const csv = buildCSV(findings);
        downloadBlob(csv, `compliance-findings-${safeName}-${getDateStamp()}.csv`, 'text/csv;charset=utf-8');
        break;
      }
      case 'json': {
        const json = JSON.stringify(findings, null, 2);
        downloadBlob(json, `compliance-findings-${safeName}-${getDateStamp()}.json`, 'application/json');
        break;
      }
      case 'ckl': {
        const allHosts = new Set<string>();
        for (const finding of findings) {
          for (const host of finding.hosts) allHosts.add(host.host);
        }
        const hostname = allHosts.values().next().value || 'unknown-host';
        const ckl = generateCKL(findings, hostname, profileName || 'Compliance Scan');
        downloadBlob(ckl, `compliance-findings-${safeName}-${getDateStamp()}.ckl`, 'application/xml');
        break;
      }
    }
    handleClose();
  }, [findings, safeName, profileName]);

  const handleArtifactExport = useCallback(async (artifact: ScanArtifact) => {
    if (!scanId || !onDownloadArtifact) return;
    setDownloading(true);
    try {
      await onDownloadArtifact(scanId, artifact.artifactKey, artifact.artifactName);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alertApi.post({ message: `Failed to download ${artifact.artifactName}: ${msg}`, severity: 'error' });
    } finally {
      setDownloading(false);
      handleClose();
    }
  }, [scanId, onDownloadArtifact, alertApi]);

  const cffFormats = formats.filter(f => f.type === 'cff_derived');
  const artifactFormats = formats.filter(f => f.type === 'artifact');

  return (
    <>
      <Button
        variant="outlined"
        startIcon={downloading ? <CircularProgress size={16} /> : <GetAppIcon />}
        onClick={handleClick}
        disabled={findings.length === 0 || downloading}
      >
        Export
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
      >
        {cffFormats.map(fmt => (
          <MenuItem key={fmt.key} onClick={() => handleCffExport(fmt)}>
            <ListItemIcon>{getFormatIcon(fmt)}</ListItemIcon>
            <ListItemText primary={fmt.label} secondary={fmt.description} />
          </MenuItem>
        ))}

        {artifacts.length > 0 && (
          <>
            <Divider />
            {artifacts.map(artifact => {
              const fmt = artifactFormats.find(f =>
                f.artifact_key && (
                  artifact.artifactKey === f.artifact_key ||
                  (f.artifact_key.endsWith('*') && artifact.artifactKey.startsWith(f.artifact_key.slice(0, -1)))
                )
              );
              return (
                <MenuItem key={artifact.id} onClick={() => handleArtifactExport(artifact)}>
                  <ListItemIcon><CloudDownloadIcon fontSize="small" /></ListItemIcon>
                  <ListItemText
                    primary={artifact.artifactName}
                    secondary={fmt?.description || fmt?.label || artifact.mimeType}
                  />
                </MenuItem>
              );
            })}
          </>
        )}
      </Menu>
    </>
  );
};
