import { useNavigate } from 'react-router-dom';
import { InfoCard, Breadcrumbs } from '@backstage/core-components';
import { Typography, Button, Box, Paper } from '@material-ui/core';
import ErrorIcon from '@material-ui/icons/Error';
import { ScanProgress } from '../ScanProgress';
import { STATUS_COLORS } from '../shared/colors';

interface ScanFailedViewProps {
  scanFailed: string;
  isWorkflowPoll: boolean;
  jobId?: string;
  scanType?: 'assessment' | 'verification' | 'remediation';
  onComplete: () => void;
  onFailed: (status: string) => void;
}

export const ScanFailedView = ({
  scanFailed,
  isWorkflowPoll,
  jobId,
  scanType = 'assessment',
  onComplete,
  onFailed,
}: ScanFailedViewProps) => {
  const navigate = useNavigate();
  const isVerification = scanType === 'verification';

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
          {isVerification ? 'Verification Failed' : 'Scan Failed'}
        </Typography>
      </Breadcrumbs>

      <Box mt={2} />

      {isWorkflowPoll && jobId && (
        <ScanProgress
          workflowJobId={Number(jobId)}
          onComplete={onComplete}
          onFailed={onFailed}
          scanType={scanType}
        />
      )}

      <Box mt={2} />

      <InfoCard title="Scan Failed">
        <Box p={3} textAlign="center">
          <ErrorIcon
            style={{
              fontSize: 64,
              color: STATUS_COLORS.error,
              marginBottom: 16,
            }}
          />
          <Typography variant="h6" color="textSecondary" gutterBottom>
            The compliance scan did not complete successfully
          </Typography>
          {scanFailed.length > 20 || scanFailed.includes('\n') ? (
            <>
              <Typography variant="body2" color="textSecondary" paragraph>
                The Controller reported the following error:
              </Typography>
              <Paper
                variant="outlined"
                style={{
                  maxHeight: 300,
                  overflow: 'auto',
                  padding: 16,
                  marginTop: 16,
                  marginBottom: 16,
                  textAlign: 'left',
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                  }}
                >
                  {scanFailed}
                </pre>
              </Paper>
            </>
          ) : (
            <Typography variant="body2" color="textSecondary" paragraph>
              The workflow ended with status: <strong>{scanFailed}</strong>.
              This is typically caused by unreachable hosts, missing
              credentials, or misconfigured inventory. Check the AAP Controller
              job log for details.
            </Typography>
          )}
          <Box display="flex" justifyContent="center" style={{ gap: 8 }}>
            <Button variant="outlined" onClick={() => navigate('/compliance')}>
              Back to Overview
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={() => navigate('/compliance/scan')}
            >
              Try Again
            </Button>
          </Box>
        </Box>
      </InfoCard>
    </>
  );
};
