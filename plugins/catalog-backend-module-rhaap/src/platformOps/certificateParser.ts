import { CertificateInfo, CertificateSummary } from '@ansible/backstage-rhaap-common';

export interface CertificateThresholds {
  highWaterMark: number;
  criticalWaterMark: number;
}

export interface ParsedCertificateResult {
  certificates: CertificateInfo[];
  summary?: CertificateSummary;
  host?: string;
  checkDate?: string;
  thresholds?: CertificateThresholds;
  parseErrors: string[];
}

/**
 * Structure of the JSON report output from check-aap-certs.yml playbook
 */
interface PlaybookCertReport {
  host: string;
  checkDate: string;
  thresholds: {
    highWaterMark: number;
    criticalWaterMark: number;
  };
  summary: {
    total: string | number;
    ok: string | number;
    warning: string | number;
    critical: string | number;
    expired: string | number;
    missing: string | number;
  };
  certificates: Array<{
    name: string;
    path: string;
    exists: boolean;
    days_remaining: number | null;
    expiry_date: string;
    cn: string;
    issuer: string;
    source: string;
    status: string;
  }>;
}

/**
 * Parses certificate information from Ansible playbook stdout.
 * Looks for CERT_REPORT_JSON marker with structured JSON data.
 */
export function parseCertificateOutput(
  stdout: string,
): ParsedCertificateResult {
  const parseErrors: string[] = [];

  // The playbook outputs in Ansible debug format:
  // "msg": "CERT_REPORT_JSON:{\"host\": \"value\", ...}}"
  // The JSON is escaped because it's inside a JSON string value
  // Structure ends with: ...]}} (warning array, actionRequired obj, main obj)

  const msgJsonMatch = stdout.match(/CERT_REPORT_JSON:(\{.*\]\}\})/);

  if (msgJsonMatch) {
    try {
      let jsonStr = msgJsonMatch[1];
      // Unescape the JSON string - the quotes and backslashes are escaped
      jsonStr = jsonStr.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      const report = JSON.parse(jsonStr) as PlaybookCertReport;
      return parsePlaybookJson(report);
    } catch (e) {
      parseErrors.push(`Failed to parse JSON report: ${e}`);
    }
  }

  parseErrors.push('No CERT_REPORT_JSON marker found in playbook output');
  return { certificates: [], parseErrors };
}

/**
 * Converts playbook JSON report to our CertificateInfo format
 */
function parsePlaybookJson(report: PlaybookCertReport): ParsedCertificateResult {
  const certificates: CertificateInfo[] = report.certificates.map(cert => ({
    name: cert.name,
    status: cert.status as CertificateInfo['status'],
    expiryDate: cert.expiry_date,
    daysRemaining: cert.days_remaining ?? 0,
    source: cert.source,
    path: cert.path,
    host: report.host,
  }));

  const summary: CertificateSummary = {
    total: Number(report.summary.total),
    ok: Number(report.summary.ok),
    warning: Number(report.summary.warning),
    critical: Number(report.summary.critical || 0),
    expired: Number(report.summary.expired),
    missing: Number(report.summary.missing),
    error: 0,
  };

  return {
    certificates,
    summary,
    host: report.host,
    checkDate: report.checkDate,
    thresholds: report.thresholds,
    parseErrors: [],
  };
}

/**
 * Computes summary statistics from a list of certificates.
 * Used as fallback if playbook doesn't provide summary.
 */
export function computeCertificateSummary(certificates: CertificateInfo[]): CertificateSummary {
  return {
    total: certificates.length,
    ok: certificates.filter(c => c.status === 'ok').length,
    warning: certificates.filter(c => c.status === 'warning').length,
    critical: certificates.filter(c => c.status === 'critical').length,
    expired: certificates.filter(c => c.status === 'expired').length,
    missing: certificates.filter(c => c.status === 'missing').length,
    error: certificates.filter(c => c.status === 'error').length,
  };
}
